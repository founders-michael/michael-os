package com.michaelos.core.network

import com.michaelos.core.model.AppError
import com.michaelos.core.model.ServerMessage
import com.michaelos.core.model.apiJson
import com.michaelos.core.testing.ContractExamples
import kotlinx.serialization.Serializable
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.io.InterruptedIOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLHandshakeException

class ErrorMappingTest {
    @Serializable
    private data class Table(
        val cases: List<Row>,
    )

    @Serializable
    private data class Row(
        val example: String? = null,
        val body: String? = null,
        val status: Int,
        val retryAfter: String? = null,
        val expect: Expected,
    )

    @Serializable
    private data class Expected(
        val case: String,
        val text: String? = null,
        val code: String? = null,
        val fields: List<String>? = null,
        val retryAfterSeconds: Int? = null,
    )

    @Test
    fun everyRowOfTheSharedTable() {
        val rows = apiJson.decodeFromString<Table>(ContractExamples.file("error-mapping.json")).cases
        assertTrue(rows.size >= 19)
        for (row in rows) {
            val body = row.example?.let(ContractExamples::example) ?: row.body.orEmpty()
            val error = appErrorOf(Failure.Response(row.status, body, row.retryAfter))
            assertEquals("${row.status} ${row.example ?: row.body}", row.expect, summary(error, row.expect))
        }
    }

    @Test
    fun transportFailures() {
        val cases: List<Pair<IOException, AppError>> =
            listOf(
                SocketTimeoutException() to AppError.Timeout,
                InterruptedIOException("timeout") to AppError.Timeout,
                UnknownHostException() to AppError.Offline,
                ConnectException() to AppError.Offline,
                SSLHandshakeException("handshake") to AppError.Offline,
                IOException("unexpected end of stream") to AppError.Offline,
            )
        for ((error, expected) in cases) {
            assertEquals(error::class.simpleName, expected, appErrorOf(Failure.Transport(error)))
        }
    }

    private fun summary(
        error: AppError,
        like: Expected,
    ): Expected {
        val message = serverMessage(error)
        val fields = (error as? AppError.Validation)?.fields?.keys?.sorted()
        return Expected(
            case = checkNotNull(error::class.simpleName).replaceFirstChar { it.lowercase() },
            text = message.text,
            code = message.code,
            fields = if (like.fields == null) null else fields,
            retryAfterSeconds = (error as? AppError.RateLimited)?.retryAfter?.inWholeSeconds?.toInt(),
        )
    }

    private fun serverMessage(error: AppError): ServerMessage =
        when (error) {
            is AppError.Unauthorized -> error.server
            is AppError.Forbidden -> error.server
            is AppError.NotFound -> error.server
            is AppError.Conflict -> error.server
            is AppError.Server -> error.server
            is AppError.Validation -> error.server
            is AppError.RateLimited -> error.server
            AppError.Offline, AppError.Timeout, AppError.Decoding -> ServerMessage()
        }
}
