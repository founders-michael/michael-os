package com.michaelos.core.network

import com.michaelos.core.model.AppError
import com.michaelos.core.model.CalendarConflict
import com.michaelos.core.model.ServerMessage
import com.michaelos.core.model.apiJson
import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.JsonObject
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
            val message =
                ServerMessage(text = parsed?.error ?: parsed?.message, code = parsed?.code, conflicts = parsed?.conflicts.orEmpty())
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

// A planner refusal sends `fields` as a list of paths, and a body this build cannot read in part must still give its
// message and code, so each field is read on its own.
private fun errorBody(body: String): ErrorBody? {
    val root =
        try {
            apiJson.parseToJsonElement(body) as? JsonObject
        } catch (_: SerializationException) {
            null
        } ?: return null
    return ErrorBody(
        error = root.field(String.serializer(), "error"),
        message = root.field(String.serializer(), "message"),
        code = root.field(String.serializer(), "code"),
        fields = root.field(MapSerializer(String.serializer(), ListSerializer(String.serializer())), "fields"),
        conflicts = root.field(ListSerializer(CalendarConflict.serializer()), "conflicts"),
    )
}

private fun <T> JsonObject.field(
    serializer: KSerializer<T>,
    name: String,
): T? {
    val element = this[name] ?: return null
    return try {
        apiJson.decodeFromJsonElement(serializer, element)
    } catch (_: SerializationException) {
        null
    } catch (_: IllegalArgumentException) {
        null
    }
}

private data class ErrorBody(
    val error: String?,
    val message: String?,
    val code: String?,
    val fields: Map<String, List<String>>?,
    val conflicts: List<CalendarConflict>?,
)
