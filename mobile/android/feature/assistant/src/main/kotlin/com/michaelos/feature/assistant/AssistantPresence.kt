package com.michaelos.feature.assistant

import com.michaelos.core.model.ChatEvent
import com.michaelos.core.model.ToolStatus

// Mirrors the web app's src/lib/ai/assistant-presence.ts. The orb shows what is actually happening: its state is
// derived from the stream events and a few facts about the screen, never chosen for effect.

/** Live progress for the one turn in flight. */
data class TurnProgress(
    val phase: Phase,
    val tools: List<Tool>,
) {
    enum class Phase {
        /** The message has left the phone and the stream has not opened yet. */
        Sending,
        Accepted,
        Tool,
        Composing,
    }

    /** [finished] is null while the tool runs. */
    data class Tool(
        val name: String,
        val finished: ToolStatus? = null,
    )

    val runningTool: Tool? get() = tools.firstOrNull { it.finished == null }

    /** `message`, `error` and `ping` leave progress as it is: the first two end the turn and a ping means nothing. */
    fun advancedBy(event: ChatEvent): TurnProgress =
        when (event) {
            ChatEvent.Accepted -> {
                if (phase == Phase.Sending) ACCEPTED else this
            }

            is ChatEvent.ToolStart -> {
                TurnProgress(Phase.Tool, tools + Tool(event.name))
            }

            is ChatEvent.ToolEnd -> {
                TurnProgress(
                    Phase.Tool,
                    tools.map { if (it.name == event.name && it.finished == null) it.copy(finished = event.status) else it },
                )
            }

            ChatEvent.Composing -> {
                TurnProgress(Phase.Composing, tools)
            }

            ChatEvent.Ping, is ChatEvent.Message, is ChatEvent.Error -> {
                this
            }
        }

    /** The one line saying what Michael is doing, true of its phase: "Writing a reply" only once `composing` arrives. */
    val line: ProgressLine
        get() =
            runningTool?.let { ProgressLine.Running(it.name) } ?: when (phase) {
                Phase.Sending -> ProgressLine.Sending
                Phase.Composing -> ProgressLine.Composing
                Phase.Accepted, Phase.Tool -> ProgressLine.Thinking
            }

    companion object {
        val SENDING = TurnProgress(Phase.Sending, emptyList())
        val ACCEPTED = TurnProgress(Phase.Accepted, emptyList())
    }
}

sealed interface ProgressLine {
    data object Sending : ProgressLine

    data object Thinking : ProgressLine

    data object Composing : ProgressLine

    data class Running(
        val tool: String,
    ) : ProgressLine
}

enum class PresenceState {
    Idle,
    Listening,
    Thinking,
    Executing,
    Responding,
    AwaitingApproval,
    Error,
    ;

    /** The orb moves only while a request is in flight or a reply is being revealed. */
    val isWorking: Boolean get() = this == Thinking || this == Executing || this == Responding
}

data class PresenceSignals(
    /** Progress for a message whose reply has neither arrived nor failed; null when nothing is in flight. */
    val turn: TurnProgress?,
    val revealing: Boolean,
    val failed: Boolean,
    /** Drafts shown and not yet saved or discarded. */
    val pendingApprovals: Int,
    /** The composer has focus and text. */
    val userComposing: Boolean,
) {
    /**
     * Order is precedence. A turn that needs no tools never sends `composing`, so it stays thinking until the answer
     * lands: one model call does both, and the app cannot honestly split it.
     */
    val state: PresenceState
        get() =
            when {
                turn?.runningTool != null -> PresenceState.Executing
                turn?.phase == TurnProgress.Phase.Composing -> PresenceState.Responding
                turn != null -> PresenceState.Thinking
                revealing -> PresenceState.Responding
                failed -> PresenceState.Error
                pendingApprovals > 0 -> PresenceState.AwaitingApproval
                userComposing -> PresenceState.Listening
                else -> PresenceState.Idle
            }
}
