package com.michaelos.feature.assistant

import com.michaelos.core.model.ChatEvent
import com.michaelos.core.model.ChatReply
import com.michaelos.core.model.ChatStreamError
import com.michaelos.core.model.ToolStatus
import com.michaelos.core.testing.ContractExamples
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import java.io.File

class PresenceTest {
    private val quiet = PresenceSignals(turn = null, revealing = false, failed = false, pendingApprovals = 0, userComposing = false)

    private fun inFlight(progress: TurnProgress) = quiet.copy(turn = progress).state

    @Test
    fun aTurnWithToolsMovesThroughItsPhasesAndKeepsEachOutcome() {
        var progress = TurnProgress.ACCEPTED.advancedBy(ChatEvent.ToolStart("get_my_tasks"))
        assertEquals(TurnProgress(TurnProgress.Phase.Tool, listOf(TurnProgress.Tool("get_my_tasks"))), progress)
        progress =
            progress
                .advancedBy(ChatEvent.ToolEnd("get_my_tasks", ToolStatus.Completed))
                .advancedBy(ChatEvent.ToolStart("get_my_calendar"))
                .advancedBy(ChatEvent.ToolEnd("get_my_calendar", ToolStatus.Failed))
                .advancedBy(ChatEvent.Composing)
        assertEquals(
            TurnProgress(
                TurnProgress.Phase.Composing,
                listOf(TurnProgress.Tool("get_my_tasks", ToolStatus.Completed), TurnProgress.Tool("get_my_calendar", ToolStatus.Failed)),
            ),
            progress,
        )
    }

    @Test
    fun pingMessageAndErrorLeaveProgressAndAcceptedNeverResetsATurn() {
        val running = TurnProgress(TurnProgress.Phase.Tool, listOf(TurnProgress.Tool("get_my_goals")))
        assertEquals(running, running.advancedBy(ChatEvent.Ping))
        assertEquals(running, running.advancedBy(ChatEvent.Error(ChatStreamError("X", "x"))))
        assertEquals(running, running.advancedBy(ChatEvent.Message(ChatReply("hi", emptyList(), usedSavedData = false))))
        assertEquals(running, running.advancedBy(ChatEvent.Accepted))
        assertEquals(TurnProgress.ACCEPTED, TurnProgress.SENDING.advancedBy(ChatEvent.Accepted))
    }

    @Test
    fun inFlightARunningToolIsExecutingComposingIsRespondingAndTheRestIsThinking() {
        assertEquals(PresenceState.Thinking, inFlight(TurnProgress.SENDING))
        assertEquals(PresenceState.Thinking, inFlight(TurnProgress.ACCEPTED))
        assertEquals(PresenceState.Executing, inFlight(TurnProgress(TurnProgress.Phase.Tool, listOf(TurnProgress.Tool("a")))))
        assertEquals(
            PresenceState.Thinking,
            inFlight(TurnProgress(TurnProgress.Phase.Tool, listOf(TurnProgress.Tool("a", ToolStatus.Completed)))),
        )
        assertEquals(PresenceState.Responding, inFlight(TurnProgress(TurnProgress.Phase.Composing, emptyList())))
        val lookingAgain = TurnProgress.ACCEPTED.advancedBy(ChatEvent.Composing).advancedBy(ChatEvent.ToolStart("get_my_habits"))
        assertEquals(PresenceState.Executing, inFlight(lookingAgain))
    }

    @Test
    fun beingInFlightOutranksEveryScreenFact() {
        assertEquals(
            PresenceState.Thinking,
            PresenceSignals(TurnProgress.ACCEPTED, revealing = true, failed = true, pendingApprovals = 2, userComposing = true).state,
        )
    }

    @Test
    fun afterTheReplyPrecedenceIsRevealErrorApprovalTypingIdle() {
        var signals = quiet.copy(revealing = true, failed = true, pendingApprovals = 1, userComposing = true)
        assertEquals(PresenceState.Responding, signals.state)
        signals = signals.copy(revealing = false)
        assertEquals(PresenceState.Error, signals.state)
        signals = signals.copy(failed = false)
        assertEquals(PresenceState.AwaitingApproval, signals.state)
        signals = signals.copy(pendingApprovals = 0)
        assertEquals(PresenceState.Listening, signals.state)
        assertEquals(PresenceState.Idle, quiet.state)
        assertFalse(PresenceState.AwaitingApproval.isWorking || PresenceState.Error.isWorking || PresenceState.Idle.isWorking)
    }

    @Test
    fun theProgressLineIsTrueOfItsPhase() {
        assertEquals(ProgressLine.Sending, TurnProgress.SENDING.line)
        assertEquals(ProgressLine.Thinking, TurnProgress.ACCEPTED.line)
        assertEquals(
            ProgressLine.Running("get_daily_overview"),
            TurnProgress(TurnProgress.Phase.Tool, listOf(TurnProgress.Tool("get_daily_overview"))).line,
        )
        assertEquals(ProgressLine.Composing, TurnProgress(TurnProgress.Phase.Composing, emptyList()).line)
        assertEquals(R.string.tool_unknown_doing, ToolLabel.of("a_tool_from_later").doing)
    }

    /** The saved stream, event by event, through the same derivation the screen uses. */
    @Test
    fun theSavedDraftStreamMapsToPresenceInOrder() {
        val events =
            ContractExamples
                .example("ai-chat-stream-draft.sse")
                .lines()
                .filter { it.startsWith("data: ") }
                .mapNotNull { ChatEvent.decode(it.removePrefix("data: ")) }
        var progress = TurnProgress.SENDING
        val states = mutableListOf(inFlight(progress))
        for (event in events.takeWhile { it !is ChatEvent.Message }) {
            progress = progress.advancedBy(event)
            states += inFlight(progress)
        }
        assertEquals(
            listOf(
                PresenceState.Thinking,
                PresenceState.Thinking,
                PresenceState.Executing,
                PresenceState.Thinking,
                PresenceState.Responding,
            ),
            states,
        )
    }

    @Test
    fun theLabelTableCoversEveryLifestyleToolDeclared() {
        val declarations = File(checkNotNull(System.getProperty("contract.path")), "../../shared/ai/tool-declarations.json").readText()
        val lifestyle =
            Json
                .parseToJsonElement(declarations)
                .jsonObject
                .getValue("tools")
                .jsonArray
                .map { it.jsonObject }
                .filter { it.getValue("product").jsonPrimitive.content == "lifestyle" }
                .map { it.getValue("name").jsonPrimitive.content }
        assertEquals(lifestyle.toSet(), ToolLabel.known.keys)
    }
}
