package com.michaelos.core.network

import com.michaelos.core.model.AppError
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.ServerMessage
import com.michaelos.core.model.SignInRequest
import com.michaelos.core.model.SignInResponse
import com.michaelos.core.model.SignOutResponse
import com.michaelos.core.model.TaskPage
import com.michaelos.core.model.TaskResponse
import com.michaelos.core.testing.ContractExamples
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.Collections
import java.util.concurrent.TimeUnit
import kotlin.time.Duration

class ApiClientTest {
    private class Credentials(
        private val token: String?,
    ) : SessionCredentials {
        val rejected: MutableList<String> = Collections.synchronizedList(mutableListOf())

        override fun currentToken() = token

        override fun reject(token: String) {
            rejected += token
        }
    }

    private val server = MockWebServer()
    private val logs: MutableList<String> = Collections.synchronizedList(mutableListOf())

    @Before
    fun start() = server.start()

    @After
    fun stop() = server.close()

    private fun client(credentials: SessionCredentials = Credentials("token-abc")) =
        ApiClient(server.url("/"), credentials, NetworkModule.okHttpClient(), retryDelay = Duration.ZERO, log = { logs += it })

    private fun respond(
        code: Int,
        body: String = "",
        vararg headers: Pair<String, String>,
    ) = server.enqueue(
        MockResponse
            .Builder()
            .code(code)
            .body(body)
            .apply { headers.forEach { (name, value) -> addHeader(name, value) } }
            .build(),
    )

    @Test
    fun sendsBearerTokenAndDecodes() =
        runBlocking {
            respond(200, ContractExamples.example("tasks-list.json"))
            val outcome = client().send(ApiRequest.get<TaskPage>("/api/tasks", listOf("page" to "1")))
            assertEquals(
                3,
                (outcome as Outcome.Success)
                    .value.value.tasks.size,
            )
            val request = server.takeRequest()
            assertEquals("/api/tasks?page=1", request.url.encodedPath + "?" + request.url.encodedQuery)
            assertEquals("Bearer token-abc", request.headers["Authorization"])
            for (header in listOf("Origin", "Referer", "Sec-Fetch-Mode", "Sec-Fetch-Site", "Cookie")) {
                assertNull(header, request.headers[header])
            }
        }

    @Test
    fun storesNoCookies() =
        runBlocking {
            respond(200, """{"success":true}""", "Set-Cookie" to "better-auth.session_token=abc; Path=/; HttpOnly")
            respond(200, """{"success":true}""")
            val client = client(Credentials(null))
            client.send(ApiRequest.get<SignOutResponse>("/api/auth/ok"))
            client.send(ApiRequest.get<SignOutResponse>("/api/auth/ok"))
            server.takeRequest()
            assertNull(server.takeRequest().headers["Cookie"])
        }

    @Test
    fun readsAreRetriedTwiceThenSucceed() =
        runBlocking {
            respond(503)
            respond(503)
            respond(200, """{"success":true}""")
            assertTrue(client().send(ApiRequest.get<SignOutResponse>("/x")) is Outcome.Success)
            assertEquals(3, server.requestCount)
        }

    @Test
    fun readsGiveUpAfterTwoRetries() =
        runBlocking {
            repeat(3) { respond(502, "<html>") }
            assertEquals(Outcome.Failure(AppError.Server(ServerMessage())), client().send(ApiRequest.get<SignOutResponse>("/x")))
            assertEquals(3, server.requestCount)
        }

    @Test
    fun writesAreNeverRetried() =
        runBlocking {
            respond(503)
            client().send(ApiRequest.post<SignOutResponse, EmptyBody>("/api/auth/sign-out", EmptyBody))
            assertEquals(1, server.requestCount)
            assertEquals("{}", server.takeRequest().body?.utf8())
        }

    @Test
    fun clientErrorsAreNotRetried() =
        runBlocking {
            respond(404, """{"error":"Task not found."}""")
            assertEquals(
                Outcome.Failure(AppError.NotFound(ServerMessage(text = "Task not found."))),
                client().send(ApiRequest.get<TaskResponse>("/api/tasks/x")),
            )
            assertEquals(1, server.requestCount)
        }

    @Test
    fun unauthorizedReportsTheTokenThatWasRefused() =
        runBlocking {
            respond(401, ContractExamples.example("tasks-list-401.json"))
            val credentials = Credentials("token-abc")
            assertEquals(
                Outcome.Failure(AppError.Unauthorized(ServerMessage(text = "Sign in to access tasks."))),
                client(credentials).send(ApiRequest.get<TaskPage>("/api/tasks")),
            )
            assertEquals(listOf("token-abc"), credentials.rejected)
        }

    @Test
    fun timeoutMapsToTimeout() =
        runBlocking {
            server.enqueue(MockResponse.Builder().headersDelay(2, TimeUnit.SECONDS).build())
            val quick = OkHttpClient.Builder().callTimeout(200, TimeUnit.MILLISECONDS).build()
            val client = ApiClient(server.url("/"), Credentials(null), quick, Duration.ZERO, log = {})
            assertEquals(Outcome.Failure(AppError.Timeout), client.send(ApiRequest.post<TaskPage, EmptyBody>("/x", EmptyBody)))
        }

    @Test
    fun cancelledCallThrowsCancellationNotAFailure() {
        server.enqueue(MockResponse.Builder().headersDelay(30, TimeUnit.SECONDS).build())
        assertThrows(CancellationException::class.java) {
            runBlocking {
                // Undispatched, so the call is on the wire before this thread blocks waiting for it.
                val call = async(start = CoroutineStart.UNDISPATCHED) { client().send(ApiRequest.get<TaskPage>("/api/tasks")) }
                checkNotNull(server.takeRequest(10, TimeUnit.SECONDS))
                call.cancel()
                call.await()
            }
        }
    }

    @Test
    fun decodingFailureIsReportedWithoutValues() =
        runBlocking {
            respond(200, """{"tasks":"secret-body-value","page":1}""")
            assertEquals(Outcome.Failure(AppError.Decoding), client().send(ApiRequest.get<TaskPage>("/api/tasks")))
            assertTrue(logs.any { it.contains("decoding failed") })
            assertFalse(logs.joinToString().contains("secret-body-value"))
        }

    @Test
    fun logsCarryNeitherTheTokenNorBodies() =
        runBlocking {
            respond(200, ContractExamples.example("auth-sign-in.json"), "set-auth-token" to "header-token-xyz")
            respond(400, """{"error":"secret-error-text","fields":{"title":["secret-field"]}}""")
            val client = client()
            val signIn =
                client.send(
                    ApiRequest.post<SignInResponse, SignInRequest>(
                        "/api/auth/sign-in/email",
                        SignInRequest("sam@example.test", "password-value"),
                    ),
                )
            assertEquals("header-token-xyz", (signIn as Outcome.Success).value.header("Set-Auth-Token"))
            client.send(ApiRequest.get<TaskPage>("/api/tasks", listOf("search" to "private words")))

            val written = logs.joinToString("\n")
            assertEquals(2, logs.size)
            for (secret in listOf(
                "token-abc",
                "header-token-xyz",
                "REDACTED-SESSION-TOKEN",
                "sam@example.test",
                "password-value",
                "secret-error-text",
                "secret-field",
                "private words",
                "private%20words",
            )) {
                assertFalse(secret, written.contains(secret))
            }
        }
}
