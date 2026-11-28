package com.michaelos.feature.assistant

import androidx.annotation.StringRes
import com.michaelos.core.model.AppError
import com.michaelos.core.model.ChatStreamError
import com.michaelos.core.model.Conversation
import com.michaelos.core.model.PlanningProposal
import com.michaelos.core.model.ServerMessage
import com.michaelos.core.model.ToolActivity
import java.time.Instant

/**
 * What the chat shows. A turn in flight, a failure and a pending acknowledgement each hold the user's message, which
 * is not part of the transcript until the server has saved the exchange.
 */
data class ChatContent(
    val conversation: Conversation? = null,
    val entries: List<ChatEntry> = emptyList(),
    /** The page of older messages still to load, oldest first; null when everything is shown. */
    val earlierPage: Int? = null,
    val loadingEarlier: Boolean = false,
    val turn: Turn? = null,
    val failure: ChatFailure? = null,
    /** The server asked for the data-use acknowledgement before sending this message. */
    val acknowledgement: String? = null,
    val revealing: String? = null,
) {
    val isEmpty: Boolean get() = entries.isEmpty() && turn == null && failure == null && acknowledgement == null

    val pendingDrafts: Int
        get() =
            entries.sumOf { entry ->
                (entry as? ChatEntry.Michael)?.reply?.drafts?.count {
                    it.status == DraftCard.Status.Editing ||
                        it.status == DraftCard.Status.Saving
                }
                    ?: 0
            }
}

data class Turn(
    val message: String,
    val progress: TurnProgress,
)

sealed interface ChatEntry {
    val id: String

    data class User(
        override val id: String,
        val text: String,
    ) : ChatEntry

    data class Michael(
        override val id: String,
        val reply: MichaelReply,
    ) : ChatEntry
}

data class MichaelReply(
    val lines: List<ReplyLine>,
    val toolActivity: List<ToolActivity>,
    val usedSavedData: Boolean,
    val drafts: List<DraftCard>,
    /** Sessions the planner suggested with the reply; Calendar reviews and applies them. */
    val planningProposal: PlanningProposal?,
) {
    val plainText: String get() = ReplyFormat.plain(lines)
}

data class DraftCard(
    val id: String,
    val form: DraftForm,
    val status: Status = Status.Editing,
    /** Why the last save was refused, beside the card. */
    val error: Reason? = null,
    /** The server's reasons by form field, from a 400 with `fields`. */
    val fieldErrors: Map<String, String> = emptyMap(),
) {
    enum class Status { Editing, Saving, Saved, Discarded }
}

/** A sentence to show: the server's own words where it wrote them for the user, or one of ours. */
sealed interface Reason {
    data class Server(
        val text: String,
    ) : Reason

    data class Local(
        @param:StringRes val text: Int,
    ) : Reason
}

/** Why a message could not be answered, and the one thing the user can do about it. */
data class ChatFailure(
    val message: String,
    val reason: Reason,
    val action: Action,
) {
    sealed interface Action {
        data object Retry : Action

        data class RetryAfter(
            val at: Instant,
        ) : Action

        /**
         * The server may have finished the turn after the stream was closed, so Try again reads the conversation first
         * and sends only if the reply is not there.
         */
        data object ReloadThenRetry : Action

        /** The message is put back in the composer to shorten or change. */
        data object Edit : Action

        data object NewChat : Action

        data object FinishSetup : Action

        data object OpenHistory : Action

        data object None : Action
    }

    companion object {
        private const val FALLBACK_WAIT_SECONDS = 30L

        private val unavailableCodes =
            setOf(
                "AI_DISABLED",
                "AI_NOT_CONFIGURED",
                "AI_PAID_TIER_REQUIRED",
                "AI_CONFIGURATION_ERROR",
                "AI_LOCAL_PROVIDER_NOT_FOR_PRODUCTION",
                "AI_CONTEXT_UNAVAILABLE",
                "AI_UNAVAILABLE",
            )

        /**
         * A refusal before the stream opened. The code decides the action; the server's sentence is shown where it is
         * written for the user.
         */
        fun refused(
            error: AppError,
            message: String,
            now: Instant,
        ): ChatFailure =
            when (error) {
                AppError.Offline -> {
                    local(message, R.string.chat_failure_offline, Action.Retry)
                }

                AppError.Timeout -> {
                    local(message, R.string.chat_failure_timeout, Action.Retry)
                }

                is AppError.Unauthorized -> {
                    local(message, R.string.chat_failure_signed_out, Action.None)
                }

                is AppError.RateLimited -> {
                    val wait = error.retryAfter?.inWholeSeconds ?: FALLBACK_WAIT_SECONDS
                    server(message, error.server, R.string.chat_failure_rate_limited, Action.RetryAfter(now.plusSeconds(wait)))
                }

                is AppError.Forbidden -> {
                    if (error.server.code == "LIFESTYLE_SETUP_REQUIRED") {
                        local(message, R.string.chat_failure_setup, Action.FinishSetup)
                    } else {
                        server(message, error.server, R.string.chat_failure_no_access, Action.None)
                    }
                }

                else -> {
                    byCode(error, message)
                }
            }

        private fun byCode(
            error: AppError,
            message: String,
        ): ChatFailure =
            when {
                error is AppError.NotFound && error.server.code == "CONVERSATION_NOT_FOUND" -> {
                    local(message, R.string.chat_failure_conversation_gone, Action.NewChat)
                }

                error is AppError.Conflict && error.server.code == "CONVERSATION_LIMIT_REACHED" -> {
                    server(message, error.server, R.string.chat_failure_generic, Action.OpenHistory)
                }

                error is AppError.Validation && error.server.code == "CONVERSATION_TOO_LARGE" -> {
                    local(message, R.string.chat_failure_conversation_too_long, Action.NewChat)
                }

                error is AppError.Validation -> {
                    server(message, error.server, R.string.chat_failure_edit, Action.Edit)
                }

                // These sentences are written for whoever runs the server, not for the person asking.
                error is AppError.Server && error.server.code in unavailableCodes -> {
                    local(message, R.string.chat_failure_unavailable, Action.Retry)
                }

                else -> {
                    local(message, R.string.chat_failure_generic, Action.Retry)
                }
            }

        private fun local(
            message: String,
            @StringRes text: Int,
            action: Action,
        ) = ChatFailure(message, Reason.Local(text), action)

        private fun server(
            message: String,
            server: ServerMessage,
            @StringRes fallback: Int,
            action: Action,
        ) = ChatFailure(message, server.text?.let(Reason::Server) ?: Reason.Local(fallback), action)

        /** An `error` event after the stream opened: the server's sentence and code, as the JSON route would send. */
        fun streamFailed(
            error: ChatStreamError,
            message: String,
            now: Instant,
        ): ChatFailure {
            val action =
                if (error.code == "PROVIDER_RATE_LIMITED") {
                    Action.RetryAfter(now.plusSeconds(error.retryAfterSeconds?.toLong() ?: FALLBACK_WAIT_SECONDS))
                } else {
                    Action.Retry
                }
            return ChatFailure(message, Reason.Server(error.message), action)
        }

        /** The stream closed with neither a reply nor an error: a dropped connection, never an empty reply. */
        fun interrupted(message: String) = ChatFailure(message, Reason.Local(R.string.chat_failure_interrupted), Action.Retry)

        /** The app stayed in the background past the grace period and the stream was closed without a reply. */
        fun backgrounded(message: String) = ChatFailure(message, Reason.Local(R.string.chat_failure_backgrounded), Action.ReloadThenRetry)
    }
}
