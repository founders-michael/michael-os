package com.michaelos.feature.assistant

import androidx.lifecycle.SavedStateHandle
import com.michaelos.core.model.ChatEvent
import com.michaelos.core.model.ChatReply
import com.michaelos.core.model.RecordDraft
import com.michaelos.core.model.ToolActivity
import com.michaelos.core.model.ToolStatus
import com.michaelos.core.testing.FakeAssistantRepository
import com.michaelos.core.testing.FakeHabitRepository
import com.michaelos.core.testing.FakeRecordRepository
import com.michaelos.core.testing.FakeTaskRepository
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.time.Duration

/** The fakes and helpers the chat view model tests share. */
class ChatHarness(
    val assistant: FakeAssistantRepository = FakeAssistantRepository(),
) {
    class MutableClock(
        var now: Instant,
    ) : Clock() {
        override fun getZone(): ZoneId = ZoneOffset.UTC

        override fun withZone(zone: ZoneId?): Clock = this

        override fun instant(): Instant = now
    }

    val tasks = FakeTaskRepository()
    val habits = FakeHabitRepository()
    val records = FakeRecordRepository()
    val clock = MutableClock(Instant.parse("2027-01-15T08:00:00Z"))

    fun model(
        saved: Map<String, Any?> = emptyMap(),
        grace: Duration = Duration.ZERO,
    ) = AssistantViewModel(
        AssistantRepositories(assistant, tasks, records, habits, records, records),
        clock,
        SavedStateHandle(saved),
    ).also {
        it.backgroundGrace = grace
    }

    fun drafts(model: AssistantViewModel): List<DraftCard> =
        model.content
            ?.entries
            ?.filterIsInstance<ChatEntry.Michael>()
            ?.flatMap { it.reply.drafts }
            .orEmpty()

    fun AssistantViewModel.sent(text: String) {
        type(text)
        sendComposer()
    }

    companion object {
        val REPLY =
            ChatReply(
                "**Start** with the investor update.",
                listOf(ToolActivity("get_my_tasks", ToolStatus.Completed)),
                usedSavedData = true,
            )

        fun draftReply(vararg drafts: RecordDraft) =
            FakeAssistantRepository.Step.Event(
                ChatEvent.Message(
                    ChatReply("Here is a draft. Press Save to add it.", emptyList(), usedSavedData = true, drafts = drafts.toList()),
                ),
            )

        fun event(event: ChatEvent) = FakeAssistantRepository.Step.Event(event)
    }
}
