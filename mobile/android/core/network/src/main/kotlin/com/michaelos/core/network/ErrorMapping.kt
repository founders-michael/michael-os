package com.michaelos.core.network

import com.michaelos.core.model.AppError
import com.michaelos.core.model.ServerMessage
import com.michaelos.core.model.apiJson
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import java.io.IOException
import java.io.InterruptedIOException
import kotlin.time.Duration.Companion.seconds

internal sealed interface Failure {
    data class Response(
        val status: Int,
        val body: String,
        val retryAfter: String?,
    ) : Failure

    data class Transport(
        val error: IOException,
    ) : Failure
}

/** The one place a failed request becomes an [AppError]. The table is in engineering-standards.md section 4. */
internal fun appErrorOf(failure: Failure): AppError =
    when (failure) {
        // OkHttp reports every timeout, connect, read or whole-call, as an InterruptedIOException.
        is Failure.Transport -> {
            if (failure.error is InterruptedIOException) AppError.Timeout else AppError.Offline
        }

        is Failure.Response -> {
            val parsed = errorBody(failure.body)
            // Next.js routes send `error`; Better Auth's own routes send `message`.
            val message = ServerMessage(text = parsed?.error ?: parsed?.message, code = parsed?.code)
            when (failure.status) {
                400, 413, 422 -> AppError.Validation(message, parsed?.fields.orEmpty())
                401 -> AppError.Unauthorized(message)
                403 -> AppError.Forbidden(message)
                404 -> AppError.NotFound(message)
                409 -> AppError.Conflict(message)
                429 -> AppError.RateLimited(message, failure.retryAfter?.toIntOrNull()?.seconds)
                else -> AppError.Server(message)
            }
        }
    }

private fun errorBody(body: String): ErrorBody? =
    try {
        apiJson.decodeFromString<ErrorBody>(body)
    } catch (_: SerializationException) {
        null
    } catch (_: IllegalArgumentException) {
        null
    }

@Serializable
private data class ErrorBody(
    val error: String? = null,
    val message: String? = null,
    val code: String? = null,
    val fields: Map<String, List<String>>? = null,
)
