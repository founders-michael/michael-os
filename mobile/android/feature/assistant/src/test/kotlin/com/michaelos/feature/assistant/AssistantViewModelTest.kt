package com.michaelos.feature.assistant

import com.michaelos.core.model.AppError
import com.michaelos.core.model.ChatEvent
import com.michaelos.core.model.ChatReply
import com.michaelos.core.model.ChatRequest
import com.michaelos.core.model.ChatStreamError
import com.michaelos.core.model.Conversation
import com.michaelos.core.model.ConversationMessage
import com.michaelos.core.model.MessageRole
import com.michaelos.core.model.PlanningProposal
import com.michaelos.core.model.ServerMessage
import com.michaelos.core.model.ToolStatus
import com.michaelos.core.testing.FakeAssistantRepository
import com.michaelos.core.testing.FakeAssistantRepository.Step
import com.michaelos.core.testing.MainDispatcherRule
import com.michaelos.feature.assistant.ChatHarness.Companion.REPLY
import com.michaelos.feature.assistant.ChatHarness.Companion.event
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.time.Instant

class AssistantViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val chat = ChatHarness()
    private val assistant get() = chat.assistant

    private fun AssistantViewModel.sent(text: String) = with(chat) { sent(text) }

    @Test
    fun theFirstMessageCreatesTheConversationAndSendsNoHistory() {
        assistant.script(
            event(ChatEvent.Accepted),
            event(ChatEvent.ToolStart("get_my_tasks")),
            event(ChatEvent.ToolEnd("get_my_tasks", ToolStatus.Completed)),
            event(ChatEvent.Composing),
            event(ChatEvent.Message(REPLY)),
        )
        val model = chat.model()
        model.sent("  What first?  ")
        assertEquals(listOf(ChatRequest("What first?", "new-1", dataUseAcknowledged = false)), assistant.sent)
        assertEquals(1, assistant.calls.count { it == FakeAssistantRepository.Call.Create })
        val content = model.content!!
        assertEquals(2, content.entries.size)
        assertEquals(content.entries.last().id, content.revealing)
        assertEquals(PresenceState.Responding, model.presence.value)
        assertEquals("", model.composer.value)
        model.finishReveal(content.entries.last().id)
        assertEquals(PresenceState.Idle, model.presence.value)
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    @Test
    fun aRevealTheScreenNeverFinishesStillEndsAtItsLimit() {
        assistant.script(event(ChatEvent.Message(REPLY)))
        val model = chat.model()
        model.sent("What first?")
        assertEquals(PresenceState.Responding, model.presence.value)
        main.dispatcher.scheduler.advanceTimeBy(ReplyReveal.LIMIT.inWholeMilliseconds + 1)
        assertEquals(PresenceState.Idle, model.presence.value)
    }

    @Test
    fun theSecondMessageReusesTheConversation() {
        assistant.script(event(ChatEvent.Message(REPLY)))
        assistant.script(event(ChatEvent.Message(REPLY)))
        val model = chat.model()
        model.sent("One")
        model.sent("Two")
        assertEquals(listOf("new-1", "new-1"), assistant.sent.map { it.conversationId })
        assertEquals(4, model.content!!.entries.size)
    }

    @Test
    fun presenceFollowsTheStreamWhileTheReplyIsInFlight() {
        val gate = CompletableDeferred<Unit>()
        assistant.script(
            event(ChatEvent.Accepted),
            event(ChatEvent.ToolStart("get_my_tasks")),
            Step.Wait(gate),
            event(ChatEvent.Message(REPLY)),
        )
        val model = chat.model()
        model.sent("What first?")
        assertEquals(PresenceState.Executing, model.presence.value)
        assertEquals(
            ProgressLine.Running("get_my_tasks"),
            model.content!!
                .turn!!
                .progress.line,
        )
        assertFalse(model.canSend)
        model.type("Another")
        model.sendComposer()
        model.send("A suggestion")
        gate.complete(Unit)
        assertNull(model.content!!.turn)
        assertEquals(1, assistant.sent.size)
        assertEquals("Another", model.composer.value)
    }

    @Test
    fun anErrorEventAfterAcceptedShowsTheServersWordsAndRetrySendsAgain() {
        assistant.script(
            event(ChatEvent.Accepted),
            event(ChatEvent.Error(ChatStreamError("AI_TIMEOUT", "Michael took too long to respond. Please retry."))),
        )
        assistant.script(event(ChatEvent.Message(REPLY)))
        val model = chat.model()
        model.sent("What first?")
        assertEquals(
            ChatFailure("What first?", Reason.Server("Michael took too long to respond. Please retry."), ChatFailure.Action.Retry),
            model.content!!.failure,
        )
        assertTrue(model.content!!.entries.isEmpty())
        assertEquals(PresenceState.Error, model.presence.value)
        model.retry()
        assertNull(model.content!!.failure)
        assertEquals(listOf("What first?", "What first?"), assistant.sent.map { it.message })
    }

    @Test
    fun aStreamEndingWithNeitherReplyNorErrorIsAnInterruption() {
        assistant.script(event(ChatEvent.Accepted), event(ChatEvent.Ping))
        val model = chat.model()
        model.sent("What first?")
        assertEquals(ChatFailure.interrupted("What first?"), model.content!!.failure)
        assertTrue(model.content!!.entries.isEmpty())
    }

    @Test
    fun aProviderRateLimitWaitsBeforeRetrying() {
        assistant.script(
            event(ChatEvent.Accepted),
            event(ChatEvent.Error(ChatStreamError("PROVIDER_RATE_LIMITED", "The AI provider is busy.", 30))),
        )
        val model = chat.model()
        model.sent("What first?")
        model.retry()
        assertEquals(1, assistant.sent.size)
        chat.clock.now = chat.clock.now.plusSeconds(31)
        model.retry()
        assertEquals(2, assistant.sent.size)
    }

    @Test
    fun setupRequiredBeforeTheStreamOpensAsksToFinishSetup() {
        assistant.script(Step.Refuse(AppError.Forbidden(ServerMessage("Complete setup.", "LIFESTYLE_SETUP_REQUIRED"))))
        val model = chat.model()
        model.sent("What first?")
        assertEquals(ChatFailure.Action.FinishSetup, model.content!!.failure!!.action)
    }

    @Test
    fun aConversationThatCannotBeCreatedFailsTheSend() {
        assistant.failNext(AppError.Conflict(ServerMessage("Archive an older conversation first.", "CONVERSATION_LIMIT_REACHED")))
        val model = chat.model()
        model.sent("What first?")
        assertEquals(ChatFailure.Action.OpenHistory, model.content!!.failure!!.action)
        assertTrue(assistant.sent.isEmpty())
    }

    @Test
    fun theDataUseNoticeAsksOnceAndResendsWithTheAcknowledgement() {
        assistant.script(Step.Refuse(AppError.Validation(ServerMessage("Confirm.", "DATA_USE_ACKNOWLEDGEMENT_REQUIRED"), emptyMap())))
        assistant.script(event(ChatEvent.Message(REPLY)))
        assistant.script(event(ChatEvent.Message(REPLY)))
        val model = chat.model()
        model.sent("What first?")
        assertEquals("What first?", model.content!!.acknowledgement)
        assertNull(model.content!!.failure)
        assertFalse(model.canSend)
        model.acknowledgeDataUse()
        model.sent("And then?")
        assertEquals(listOf(false, true, true), assistant.sent.map { it.dataUseAcknowledged })
    }

    @Test
    fun decliningTheNoticePutsTheMessageBackUnsent() {
        assistant.script(Step.Refuse(AppError.Validation(ServerMessage(code = "DATA_USE_ACKNOWLEDGEMENT_REQUIRED"), emptyMap())))
        val model = chat.model()
        model.sent("What first?")
        model.declineDataUse()
        assertEquals("What first?", model.composer.value)
        assertNull(model.content!!.acknowledgement)
        assertEquals(1, assistant.sent.size)
    }

    @Test
    fun aMessageOverTheLimitCannotBeSent() {
        val model = chat.model()
        model.type("a".repeat(4001))
        assertFalse(model.canSend)
        model.sendComposer()
        assertTrue(assistant.sent.isEmpty())
        model.type("a".repeat(4000))
        assertTrue(model.canSend)
        // An emoji is two UTF-16 units, which is what the server counts.
        model.type("😀".repeat(2001))
        assertEquals(4002, model.composerCount)
        assertFalse(model.canSend)
    }

    @Test
    fun aReplyClosedInTheBackgroundIsReadBackFromTheServer() {
        val gate = CompletableDeferred<Unit>()
        assistant.script(event(ChatEvent.Accepted), Step.Wait(gate), event(ChatEvent.Message(REPLY)))
        val model = chat.model()
        model.sent("What first?")
        model.enterBackground()
        assistant.save("new-1", user = "What first?", reply = "Start with the investor update.")
        model.enterForeground()
        assertNull(model.content!!.turn)
        assertNull(model.content!!.failure)
        assertEquals(2, model.content!!.entries.size)
    }

    @Test
    fun aReplyClosedInTheBackgroundAndNeverSavedCanBeRetried() {
        val gate = CompletableDeferred<Unit>()
        assistant.script(event(ChatEvent.Accepted), Step.Wait(gate), event(ChatEvent.Message(REPLY)))
        val model = chat.model()
        model.sent("What first?")
        model.enterBackground()
        model.enterForeground()
        assertEquals(ChatFailure.backgrounded("What first?"), model.content!!.failure)
        assertNull(model.content!!.turn)
        assertTrue(model.content!!.entries.isEmpty())
        // The server finished the turn after all: Try again finds the reply instead of asking twice.
        assistant.save("new-1", user = "What first?", reply = "Start with the investor update.")
        model.retry()
        assertEquals(2, model.content!!.entries.size)
        assertNull(model.content!!.failure)
        assertEquals(1, assistant.sent.size)
    }

    @Test
    fun aReplyTheServerNeverFinishedIsSentAgainOnRetry() {
        val gate = CompletableDeferred<Unit>()
        assistant.script(event(ChatEvent.Accepted), Step.Wait(gate), event(ChatEvent.Message(REPLY)))
        assistant.script(event(ChatEvent.Message(REPLY)))
        val model = chat.model()
        model.sent("What first?")
        model.enterBackground()
        model.enterForeground()
        assertEquals(ChatFailure.backgrounded("What first?"), model.content!!.failure)
        model.retry()
        assertEquals(listOf("What first?", "What first?"), assistant.sent.map { it.message })
        assertNull(model.content!!.failure)
        assertEquals(2, model.content!!.entries.size)
    }

    @Test
    fun aLongConversationOpensAtItsNewestMessagesAndLoadsEarlierOnes() {
        val messages =
            (0 until 230).map {
                ConversationMessage("m$it", if (it % 2 == 0) MessageRole.User else MessageRole.Assistant, "$it", emptyList(), Instant.EPOCH)
            }
        val conversation = Conversation("long", "Long", 230, Instant.EPOCH, null, Instant.EPOCH)
        val chat = ChatHarness(FakeAssistantRepository(listOf(conversation), mapOf("long" to messages)))
        val model = chat.model()
        model.open("long", knownCount = 230)
        assertEquals(130, model.content!!.entries.size)
        assertEquals(
            "m100",
            model.content!!
                .entries
                .first()
                .id,
        )
        assertEquals(1, model.content!!.earlierPage)
        model.loadEarlier()
        assertEquals(230, model.content!!.entries.size)
        assertEquals(
            "m0",
            model.content!!
                .entries
                .first()
                .id,
        )
        assertNull(model.content!!.earlierPage)
    }

    @Test
    fun theOpenConversationIsReopenedAfterProcessDeath() {
        val conversation = Conversation("kept", "Kept", 2, Instant.EPOCH, null, Instant.EPOCH)
        val chat = ChatHarness(FakeAssistantRepository(listOf(conversation)))
        chat.assistant.save("kept", "Hi", "Hello.")
        val model = chat.model(saved = mapOf(AssistantViewModel.CONVERSATION to "kept", AssistantViewModel.COMPOSER to "Half typed"))
        assertEquals("kept", model.conversationId)
        assertEquals("Half typed", model.composer.value)
    }

    @Test
    fun aConversationThatCannotBeOpenedSaysSoAndCanBeLeft() {
        val model = chat.model()
        model.open("gone", knownCount = null)
        val state = model.uiState.value as AssistantUiState.Failed
        assertTrue(state.error is AppError.NotFound)
        model.deleted("gone")
        assertTrue(model.content!!.isEmpty)
    }

    @Test
    fun aHandedOverQuestionStartsANewChatUnsentAndOnlyOnce() {
        assistant.script(event(ChatEvent.Message(REPLY)))
        val model = chat.model()
        model.sent("What first?")
        model.prefill("one", "Help me with my 2 overdue tasks.")
        assertEquals("Help me with my 2 overdue tasks.", model.composer.value)
        assertTrue(model.content!!.isEmpty)
        assertNull(model.conversationId)
        model.type("Edited")
        model.prefill("one", "Help me with my 2 overdue tasks.")
        assertEquals("Edited", model.composer.value)
        assertEquals(1, assistant.sent.size)
    }

    @Test
    fun aQuestionHandedOverWhileMichaelWorksWaitsInTheComposer() {
        val gate = CompletableDeferred<Unit>()
        assistant.script(event(ChatEvent.Accepted), Step.Wait(gate), event(ChatEvent.Message(REPLY)))
        val model = chat.model()
        model.sent("What first?")
        model.prefill("one", "Plan tomorrow")
        assertEquals("Plan tomorrow", model.composer.value)
        gate.complete(Unit)
        assertEquals(2, model.content!!.entries.size)
    }

    @Test
    fun theServersTitleReplacesNewConversationAfterTheFirstExchange() {
        assistant.script(
            event(ChatEvent.Accepted),
            Step.Run { assistant.save("new-1", "Plan my week", "Done.") },
            event(ChatEvent.Message(REPLY)),
        )
        val model = chat.model()
        model.sent("Plan my week")
        assertEquals("Plan my week", model.content!!.conversation!!.title)
    }

    @Test
    fun aRepliesPlanIsShownAsAPointerUntilPlanningIsBuilt() {
        assistant.script(
            event(ChatEvent.Message(ChatReply("A plan.", emptyList(), usedSavedData = true, planningProposal = PlanningProposal()))),
        )
        val model = chat.model()
        model.sent("Plan my week")
        assertTrue((model.content!!.entries.last() as ChatEntry.Michael).reply.hasPlanningProposal)
    }
}
