package com.michaelos.core.testing

import com.michaelos.core.data.AssistantRepository
import com.michaelos.core.data.CalendarRepository
import com.michaelos.core.data.GoalRepository
import com.michaelos.core.data.MESSAGE_PAGE_SIZE
import com.michaelos.core.data.MemoryRepository
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Availability
import com.michaelos.core.model.AvailabilityUpdate
import com.michaelos.core.model.CalendarEvent
import com.michaelos.core.model.CalendarEventCreate
import com.michaelos.core.model.CalendarEventResponse
import com.michaelos.core.model.ChatEvent
import com.michaelos.core.model.ChatRequest
import com.michaelos.core.model.Conversation
import com.michaelos.core.model.ConversationFilter
import com.michaelos.core.model.ConversationMessage
import com.michaelos.core.model.ConversationMessages
import com.michaelos.core.model.ConversationPage
import com.michaelos.core.model.ConversationUpdate
import com.michaelos.core.model.DraftOutcome
import com.michaelos.core.model.Goal
import com.michaelos.core.model.GoalChange
import com.michaelos.core.model.GoalCreate
import com.michaelos.core.model.GoalList
import com.michaelos.core.model.GoalResponse
import com.michaelos.core.model.GoalSave
import com.michaelos.core.model.GoalStatus
import com.michaelos.core.model.Memory
import com.michaelos.core.model.MemoryCreate
import com.michaelos.core.model.MemoryResponse
import com.michaelos.core.model.MessageRole
import com.michaelos.core.model.MilestoneChange
import com.michaelos.core.model.MilestoneCreate
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.ServerMessage
import com.michaelos.core.model.apiJson
import kotlinx.coroutines.CompletableDeferred
import java.time.Instant
import java.time.LocalDate

/** Holds conversations and their messages, and plays a scripted stream for each message sent. */
class FakeAssistantRepository(
    conversations: List<Conversation> = emptyList(),
    messages: Map<String, List<ConversationMessage>> = emptyMap(),
) : AssistantRepository {
    /** One step of a scripted reply. [Wait] pauses the stream until the test completes the gate. */
    sealed interface Step {
        data class Event(
            val event: ChatEvent,
        ) : Step

        data class Wait(
            val gate: CompletableDeferred<Unit>,
        ) : Step

        data class Refuse(
            val error: AppError,
        ) : Step

        /** Runs while the stream is open, such as the server saving the exchange. */
        data class Run(
            val action: () -> Unit,
        ) : Step
    }

    sealed interface Call {
        data class List(
            val filter: ConversationFilter,
            val page: Int,
        ) : Call

        data object Create : Call

        data class Update(
            val id: String,
            val change: ConversationUpdate,
        ) : Call

        data class Delete(
            val id: String,
        ) : Call

        data class Messages(
            val id: String,
            val page: Int,
        ) : Call

        data class Send(
            val request: ChatRequest,
        ) : Call

        data class Record(
            val outcome: DraftOutcome,
        ) : Call
    }

    private val conversations = conversations.toMutableList()
    private val messages = messages.mapValues { it.value.toMutableList() }.toMutableMap()
    private val scripts = ArrayDeque<kotlin.collections.List<Step>>()
    private val failures = ArrayDeque<AppError>()
    private var created = 0
    val calls = mutableListOf<Call>()

    val sent: kotlin.collections.List<ChatRequest> get() = calls.filterIsInstance<Call.Send>().map { it.request }

    /** The next message sent plays these steps; with no script left, a send ends the stream with no reply. */
    fun script(vararg steps: Step) {
        scripts.addLast(steps.toList())
    }

    /** The next calls other than `send` fail with these, in order. */
    fun failNext(vararg errors: AppError) {
        failures.addAll(errors)
    }

    /** Stores an exchange, as the server does when a turn completes. */
    fun save(
        id: String,
        user: String,
        reply: String,
    ) {
        val list = messages.getOrPut(id) { mutableListOf() }
        list += ConversationMessage("m${list.size}", MessageRole.User, user, emptyList(), Instant.now())
        list += ConversationMessage("m${list.size}", MessageRole.Assistant, reply, emptyList(), Instant.now())
        val index = conversations.indexOfFirst { it.id == id }
        if (index >= 0) {
            val conversation = conversations[index]
            conversations[index] =
                conversation.copy(
                    messageCount = list.size,
                    title = if (conversation.title == "New conversation") user else conversation.title,
                )
        }
    }

    private fun <T> answer(
        call: Call,
        value: () -> Outcome<T>,
    ): Outcome<T> {
        calls += call
        return failures.removeFirstOrNull()?.let { Outcome.Failure(it) } ?: value()
    }

    private val notFound = AppError.NotFound(ServerMessage("Conversation not found.", "CONVERSATION_NOT_FOUND"))

    override suspend fun conversations(
        filter: ConversationFilter,
        page: Int,
    ): Outcome<ConversationPage> =
        answer(Call.List(filter, page)) {
            val matching = conversations.filter { (it.archivedAt != null) == (filter == ConversationFilter.Archived) }
            val pages = maxOf(1, (matching.size + LIST_PAGE - 1) / LIST_PAGE)
            Outcome.Success(ConversationPage(matching.drop((page - 1) * LIST_PAGE).take(LIST_PAGE), page, pages, matching.size))
        }

    override suspend fun createConversation(): Outcome<Conversation> =
        answer(Call.Create) {
            created += 1
            val conversation = Conversation("new-$created", "New conversation", 0, null, null, Instant.now())
            conversations.add(0, conversation)
            Outcome.Success(conversation)
        }

    override suspend fun updateConversation(
        id: String,
        change: ConversationUpdate,
    ): Outcome<Conversation> =
        answer(Call.Update(id, change)) {
            val index = conversations.indexOfFirst { it.id == id }
            if (index < 0) return@answer Outcome.Failure(notFound)
            conversations[index] =
                when (change) {
                    is ConversationUpdate.Rename -> conversations[index].copy(title = change.title)
                    is ConversationUpdate.Archive -> conversations[index].copy(archivedAt = if (change.archived) Instant.now() else null)
                }
            Outcome.Success(conversations[index])
        }

    override suspend fun deleteConversation(id: String): Outcome<Unit> =
        answer(Call.Delete(id)) {
            conversations.removeAll { it.id == id }
            messages.remove(id)
            Outcome.Success(Unit)
        }

    override suspend fun messages(
        id: String,
        page: Int,
    ): Outcome<ConversationMessages> =
        answer(Call.Messages(id, page)) {
            val conversation = conversations.firstOrNull { it.id == id } ?: return@answer Outcome.Failure(notFound)
            val all = messages[id].orEmpty()
            val pages = maxOf(1, (all.size + MESSAGE_PAGE_SIZE - 1) / MESSAGE_PAGE_SIZE)
            Outcome.Success(
                ConversationMessages(conversation, all.drop((page - 1) * MESSAGE_PAGE_SIZE).take(MESSAGE_PAGE_SIZE), page, pages),
            )
        }

    override suspend fun send(
        request: ChatRequest,
        onEvent: (ChatEvent) -> Unit,
    ): Outcome<Unit> {
        calls += Call.Send(request)
        for (step in scripts.removeFirstOrNull().orEmpty()) {
            when (step) {
                is Step.Event -> onEvent(step.event)
                is Step.Wait -> step.gate.await()
                is Step.Refuse -> return Outcome.Failure(step.error)
                is Step.Run -> step.action()
            }
        }
        return Outcome.Success(Unit)
    }

    override suspend fun record(outcome: DraftOutcome): Outcome<Unit> {
        calls += Call.Record(outcome)
        return Outcome.Success(Unit)
    }

    private companion object {
        const val LIST_PAGE = 20
    }
}

/** Records each record created from a draft and answers as the server would, unless a failure is queued. */
@Suppress("TooManyFunctions") // The goal, event and memory calls the assistant and Goals screens make.
class FakeRecordRepository :
    GoalRepository,
    CalendarRepository,
    MemoryRepository {
    sealed interface Call {
        data class Goal(
            val goal: GoalCreate,
        ) : Call

        /** Any other goal call, by name, for screens that are not under test here. */
        data class GoalCall(
            val name: String,
        ) : Call

        data class Event(
            val event: CalendarEventCreate,
        ) : Call

        data class Memory(
            val memory: MemoryCreate,
        ) : Call
    }

    val calls = mutableListOf<Call>()
    private val failures = ArrayDeque<AppError>()

    fun failNext(vararg errors: AppError) {
        failures.addAll(errors)
    }

    private fun <T> record(
        call: Call,
        example: () -> T,
    ): Outcome<T> {
        calls += call
        return failures.removeFirstOrNull()?.let { Outcome.Failure(it) } ?: Outcome.Success(example())
    }

    /** Answers with the goal in `goal-create.json`, whatever was sent. */
    override suspend fun create(goal: GoalCreate): Outcome<Goal> =
        record(Call.Goal(goal)) { apiJson.decodeFromString<GoalResponse>(ContractExamples.example("goal-create.json")).goal }

    override suspend fun list(status: GoalStatus?): Outcome<List<Goal>> =
        record(Call.GoalCall("list")) {
            apiJson.decodeFromString<GoalList>(ContractExamples.example("goals-list.json")).goals.filter {
                status == null || it.status == status
            }
        }

    override suspend fun goal(id: String): Outcome<Goal> = record(Call.GoalCall("get")) { goalExample() }

    override suspend fun today(): Outcome<LocalDate> = record(Call.GoalCall("today")) { LocalDate.parse("2026-11-28") }

    override suspend fun save(
        goal: GoalSave,
        id: String?,
    ): Outcome<Goal> = record(Call.GoalCall("save")) { goalExample() }

    override suspend fun change(
        id: String,
        change: GoalChange,
    ): Outcome<Goal> = record(Call.GoalCall("change")) { goalExample() }

    override suspend fun delete(id: String): Outcome<Unit> = record(Call.GoalCall("delete")) { }

    override suspend fun addMilestone(
        goalId: String,
        milestone: MilestoneCreate,
    ): Outcome<Unit> = record(Call.GoalCall("addMilestone")) { }

    override suspend fun changeMilestone(
        goalId: String,
        milestoneId: String,
        change: MilestoneChange,
    ): Outcome<Unit> = record(Call.GoalCall("changeMilestone")) { }

    override suspend fun deleteMilestone(
        goalId: String,
        milestoneId: String,
    ): Outcome<Unit> = record(Call.GoalCall("deleteMilestone")) { }

    private fun goalExample(): Goal = apiJson.decodeFromString<GoalResponse>(ContractExamples.example("goal-get.json")).goal

    /** Answers with the event in `calendar-event-create.json`, whatever was sent. */
    override suspend fun create(event: CalendarEventCreate): Outcome<CalendarEvent> =
        record(Call.Event(event)) {
            apiJson.decodeFromString<CalendarEventResponse>(ContractExamples.example("calendar-event-create.json")).event
        }

    override suspend fun availability(): Outcome<Availability> =
        record(Call.GoalCall("availability")) { Availability("Asia/Kolkata", configured = false, windows = emptyList()) }

    override suspend fun saveAvailability(update: AvailabilityUpdate): Outcome<Availability> =
        record(Call.GoalCall("saveAvailability")) { Availability("Asia/Kolkata", update.windows.any { it.active }, update.windows) }

    /** Answers with the memory in `memory-create.json`, whatever was sent. */
    override suspend fun create(memory: MemoryCreate): Outcome<Memory> =
        record(Call.Memory(memory)) { apiJson.decodeFromString<MemoryResponse>(ContractExamples.example("memory-create.json")).memory }
}
