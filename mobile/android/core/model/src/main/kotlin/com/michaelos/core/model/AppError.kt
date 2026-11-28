package com.michaelos.core.model

import kotlin.time.Duration

/**
 * What the server said about a failure. [text] is a user-facing sentence written by the web team and may be
 * shown as is; [code], when present, is what decides behaviour. Never branch on [text].
 */
data class ServerMessage(
    val text: String? = null,
    val code: String? = null,
    /** The events a calendar create or move would overlap, from its 409. */
    val conflicts: List<CalendarConflict> = emptyList(),
)

/**
 * Every failure a repository can report. Cancellation is not one of them: a cancelled call rethrows
 * `CancellationException` and shows nothing.
 */
sealed interface AppError {
    data object Offline : AppError

    data object Timeout : AppError

    data class Unauthorized(
        val server: ServerMessage,
    ) : AppError

    data class Forbidden(
        val server: ServerMessage,
    ) : AppError

    data class NotFound(
        val server: ServerMessage,
    ) : AppError

    data class Conflict(
        val server: ServerMessage,
    ) : AppError

    data class Validation(
        val server: ServerMessage,
        val fields: Map<String, List<String>>,
    ) : AppError

    data class RateLimited(
        val server: ServerMessage,
        val retryAfter: Duration?,
    ) : AppError

    data class Server(
        val server: ServerMessage,
    ) : AppError

    /** The body did not match the model. Always a bug. */
    data object Decoding : AppError
}

sealed interface Outcome<out T> {
    data class Success<T>(
        val value: T,
    ) : Outcome<T>

    data class Failure(
        val error: AppError,
    ) : Outcome<Nothing>
}
