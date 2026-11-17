package com.michaelos.core.network

import android.util.Log
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.apiJson
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.serialization.SerializationException
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Headers
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.time.DateTimeException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.TimeSource

/**
 * The app's one HTTP client. It stores no cookies and adds no `Origin`, `Referer` or `Sec-Fetch-*` header: the
 * server treats any of those as a browser request and refuses it without a trusted origin.
 */
class ApiClient(
    private val baseUrl: HttpUrl,
    private val credentials: SessionCredentials,
    private val http: OkHttpClient,
    private val retryDelay: Duration = 500.milliseconds,
    private val log: (String) -> Unit = { Log.d("api", it) },
) {
    /**
     * Reads are retried at most twice, with backoff, when the failure is offline, timeout or server; writes never
     * are. A cancelled call rethrows `CancellationException` instead of returning a failure.
     */
    suspend fun <T> send(request: ApiRequest<T>): Outcome<ApiResponse<T>> {
        var retries = 0
        while (true) {
            val outcome = attempt(request)
            val retry =
                outcome is Outcome.Failure &&
                    request.method == ApiRequest.Method.GET &&
                    retries < MAX_RETRIES &&
                    outcome.error.isRetryable()
            if (!retry) return outcome
            retries += 1
            delay(retryDelay * (1 shl (retries - 1)))
        }
    }

    private suspend fun <T> attempt(request: ApiRequest<T>): Outcome<ApiResponse<T>> {
        val token = credentials.currentToken()
        val started = TimeSource.Monotonic.markNow()
        val raw =
            try {
                http.newCall(build(request, token)).await()
            } catch (error: IOException) {
                log("${request.method} ${request.path} failed: ${error::class.simpleName}")
                return Outcome.Failure(appErrorOf(Failure.Transport(error)))
            }
        log("${request.method} ${request.path} ${raw.status} ${started.elapsedNow().inWholeMilliseconds}ms")

        if (raw.status !in SUCCESS) {
            if (raw.status == UNAUTHORIZED && token != null) credentials.reject(token)
            return Outcome.Failure(appErrorOf(Failure.Response(raw.status, raw.body, raw.headers["Retry-After"])))
        }
        return try {
            Outcome.Success(ApiResponse(apiJson.decodeFromString(request.response, raw.body), raw.headers))
        } catch (error: SerializationException) {
            decodingFailure(request, error)
        } catch (error: IllegalArgumentException) {
            decodingFailure(request, error)
        } catch (error: DateTimeException) {
            decodingFailure(request, error)
        }
    }

    // Only the exception's type: its message can quote the body, and bodies never reach logs.
    private fun decodingFailure(
        request: ApiRequest<*>,
        error: Exception,
    ): Outcome.Failure {
        log("${request.method} ${request.path} decoding failed: ${error::class.simpleName}")
        return Outcome.Failure(AppError.Decoding)
    }

    private fun build(
        request: ApiRequest<*>,
        token: String?,
    ): Request {
        val url =
            baseUrl
                .newBuilder()
                .addPathSegments(request.path.trimStart('/'))
                .apply { request.query.forEach { (name, value) -> addQueryParameter(name, value) } }
                .build()
        return Request
            .Builder()
            .url(url)
            .header("Accept", JSON)
            .apply { if (token != null) header("Authorization", "Bearer $token") }
            .method(request.method.name, request.body?.toRequestBody(JSON.toMediaType()))
            .build()
    }

    private class RawResponse(
        val status: Int,
        val headers: Headers,
        val body: String,
    )

    // The body is read on OkHttp's thread so the calling coroutine never blocks; cancelling the coroutine
    // cancels the call.
    private suspend fun Call.await(): RawResponse =
        suspendCancellableCoroutine { continuation ->
            continuation.invokeOnCancellation { cancel() }
            enqueue(
                object : Callback {
                    override fun onFailure(
                        call: Call,
                        e: IOException,
                    ) = continuation.resumeWithException(e)

                    override fun onResponse(
                        call: Call,
                        response: Response,
                    ) {
                        try {
                            val raw = response.use { RawResponse(it.code, it.headers, it.body.string()) }
                            continuation.resume(raw)
                        } catch (e: IOException) {
                            continuation.resumeWithException(e)
                        }
                    }
                },
            )
        }

    private fun AppError.isRetryable() = this == AppError.Offline || this == AppError.Timeout || this is AppError.Server

    private companion object {
        const val MAX_RETRIES = 2
        const val UNAUTHORIZED = 401
        const val JSON = "application/json"
        val SUCCESS = 200..299
    }
}
