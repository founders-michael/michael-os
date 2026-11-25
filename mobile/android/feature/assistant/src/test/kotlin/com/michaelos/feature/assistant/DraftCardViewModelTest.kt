package com.michaelos.feature.assistant

import com.michaelos.core.model.AppError
import com.michaelos.core.model.DraftKind
import com.michaelos.core.model.DraftOutcome
import com.michaelos.core.model.DraftValue
import com.michaelos.core.model.HabitCreate
import com.michaelos.core.model.HabitFrequency
import com.michaelos.core.model.RecordDraft
import com.michaelos.core.model.ServerMessage
import com.michaelos.core.model.TaskCreate
import com.michaelos.core.model.TaskPriority
import com.michaelos.core.testing.FakeAssistantRepository
import com.michaelos.core.testing.FakeHabitRepository
import com.michaelos.core.testing.FakeRecordRepository
import com.michaelos.core.testing.MainDispatcherRule
import com.michaelos.feature.assistant.ChatHarness.Companion.draftReply
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.time.Duration

/** Saving, refusing and discarding drafts. Nothing says saved before the create call returns. */
class DraftCardViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val chat = ChatHarness()

    private fun text(value: String) = DraftValue.Text(value)

    private fun AssistantViewModel.sent(message: String) = with(chat) { sent(message) }

    @Test
    fun aSavedDraftSaysSavedOnlyAfterTheCreateCallAndIsReported() {
        chat.assistant.script(
            draftReply(RecordDraft(DraftKind.Task, mapOf("title" to text("Call the bank"), "priority" to text("HIGH")), "UTC")),
        )
        val model = chat.model()
        model.sent("Add a task")
        val id = chat.drafts(model).single().id
        assertNotEquals(PresenceState.AwaitingApproval, model.presence.value)
        model.finishReveal(model.content!!.revealing!!)
        assertEquals(PresenceState.AwaitingApproval, model.presence.value)
        val gate = CompletableDeferred<Unit>()
        chat.tasks.holdNext(gate)
        model.save(id)
        assertEquals(DraftCard.Status.Saving, chat.drafts(model).single().status)
        model.save(id)
        gate.complete(Unit)
        assertEquals(DraftCard.Status.Saved, chat.drafts(model).single().status)
        assertEquals(listOf(TaskCreate("Call the bank", TaskPriority.High)), chat.tasks.creates)
        assertTrue(
            chat.assistant.calls.contains(FakeAssistantRepository.Call.Record(DraftOutcome(DraftOutcome.Kind.Saved, DraftKind.Task))),
        )
        assertEquals(PresenceState.Idle, model.presence.value)
        assertEquals(Destination.Tasks, destinationOf(DraftKind.Task))
    }

    @Test
    fun aRefusedSaveShowsTheServersReasonsOnTheFields() {
        val event =
            RecordDraft(
                DraftKind.CalendarEvent,
                mapOf("title" to text("Call"), "date" to text("2026-11-25"), "startTime" to text("15:00"), "endTime" to text("15:30")),
                "Pacific/Auckland",
            )
        chat.assistant.script(draftReply(event))
        val model = chat.model()
        model.sent("Add an event")
        val id = chat.drafts(model).single().id
        chat.records.failNext(
            AppError.Validation(
                ServerMessage("Check the event details."),
                mapOf("endAt" to listOf("End time must be after start time.")),
            ),
        )
        model.save(id)
        var card = chat.drafts(model).single()
        assertEquals(DraftCard.Status.Editing, card.status)
        assertEquals(Reason.Server("Check the event details."), card.error)
        assertEquals(mapOf("endTime" to "End time must be after start time."), card.fieldErrors)
        model.edit(id, "endTime", text("16:00"))
        assertTrue(
            chat
                .drafts(model)
                .single()
                .fieldErrors
                .isEmpty(),
        )
        chat.records.failNext(AppError.Conflict(ServerMessage("This time overlaps another calendar event.")))
        model.save(id)
        card = chat.drafts(model).single()
        assertEquals(Reason.Server("This time overlaps another calendar event."), card.error)
        assertEquals(DraftCard.Status.Editing, card.status)
        val body = (chat.records.calls.last() as FakeRecordRepository.Call.Event).event
        assertEquals(Duration.ofHours(1), Duration.between(body.startAt, body.endAt))
    }

    @Test
    fun eachKindSavesThroughItsOwnRepository() {
        chat.assistant.script(
            draftReply(
                RecordDraft(DraftKind.Goal, mapOf("title" to text("Run a 10k")), "UTC"),
                RecordDraft(DraftKind.Habit, mapOf("title" to text("Stretch")), "UTC"),
                RecordDraft(DraftKind.Memory, mapOf("content" to text("Mornings are for deep work.")), "UTC"),
            ),
        )
        val model = chat.model()
        model.sent("Draft three")
        chat.drafts(model).forEach { model.save(it.id) }
        assertTrue(chat.drafts(model).all { it.status == DraftCard.Status.Saved })
        assertEquals(2, chat.records.calls.size)
        assertEquals(listOf(FakeHabitRepository.Call.Create(HabitCreate("Stretch", HabitFrequency.Daily, emptyList()))), chat.habits.calls)
    }

    @Test
    fun discardRemovesTheDraftAndIsReported() {
        chat.assistant.script(draftReply(RecordDraft(DraftKind.Habit, mapOf("title" to text("Stretch")), "UTC")))
        val model = chat.model()
        model.sent("Add a habit")
        val id = chat.drafts(model).single().id
        model.discard(id)
        assertEquals(DraftCard.Status.Discarded, chat.drafts(model).single().status)
        model.save(id)
        assertTrue(
            chat.assistant.calls.contains(FakeAssistantRepository.Call.Record(DraftOutcome(DraftOutcome.Kind.Discarded, DraftKind.Habit))),
        )
        assertTrue(chat.habits.calls.isEmpty())
    }

    @Test
    fun anIncompleteDraftSaysWhatIsMissingAndPostsNothing() {
        chat.assistant.script(draftReply(RecordDraft(DraftKind.CalendarEvent, mapOf("title" to text("Call")), "UTC")))
        val model = chat.model()
        model.sent("Add an event")
        model.save(chat.drafts(model).single().id)
        assertEquals(Reason.Local(R.string.draft_error_incomplete), chat.drafts(model).single().error)
        assertTrue(chat.records.calls.isEmpty())
    }
}
