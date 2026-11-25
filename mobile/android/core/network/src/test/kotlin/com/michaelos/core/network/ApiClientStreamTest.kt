package com.michaelos.core.network

import com.michaelos.core.model.AppError
import com.michaelos.core.model.ChatEvent
import com.michaelos.core.model.DraftKind
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.ServerMessage
import com.michaelos.core.testing.ContractExamples
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.Serializable
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.Collections
import java.util.concurrent.TimeUnit
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

class ApiClientStreamTest {
    private class Credentials : SessionCredentials {
        val rejected: MutableList<String> = Collections.synchronizedList(mutableListOf())

        override fun currentToken() = "token-abc"

        override fun reject(token: String) {
            rejected += token
        }
    }

    @Serializable
    private data class Body(
        val message: String,
    )

    private val server = MockWebServer()

    @Before
    fun start() = server.start()

    @After
    fun stop() = server.close()

    private fun client(
        credentials: SessionCredentials = Credentials(),
        silence: Duration = 90.seconds,
    ) = ApiClient(server.url("/"), credentials, NetworkModule.okHttpClient(), retryDelay = Duration.ZERO, streamSilence = silence, log = {})

    @Test
    fun eventsArriveInOrderAndTheRequestIsATurn() =
        runBlocking {
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(200)
                    .addHeader("Content-Type", "text/event-stream")
                    .body(ContractExamples.example("ai-chat-stream-draft.sse"))
                    .build(),
            )
            val events = mutableListOf<ChatEvent>()
            val outcome = client().stream("/api/ai/chat", Body("Add a task")) { events += it }
            assertEquals(Outcome.Success(Unit), outcome)
            assertEquals(5, events.size)
            assertEquals(ChatEvent.Accepted, events.first())
            assertEquals(
                DraftKind.Task,
                (events.last() as ChatEvent.Message)
                    .reply.drafts
                    .single()
                    .kind,
            )
            val request = server.takeRequest()
            assertEquals("POST", request.method)
            assertEquals("/api/ai/chat", request.url.encodedPath)
            assertEquals("text/event-stream", request.headers["Accept"])
            assertEquals("Bearer token-abc", request.headers["Authorization"])
            assertNull(request.headers["Origin"])
            assertEquals("""{"message":"Add a task"}""", request.body?.utf8())
        }

    @Test
    fun aRefusalBeforeTheStreamIsAnAppErrorWithItsCode() =
        runBlocking {
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(403)
                    .body(ContractExamples.example("ai-chat-403-setup.json"))
                    .build(),
            )
            val outcome = client().stream("/api/ai/chat", Body("Hi")) {}
            assertEquals(
                Outcome.Failure(
                    AppError.Forbidden(
                        ServerMessage(
                            "Complete LifestyleOS setup before asking Michael about your personal information.",
                            "LIFESTYLE_SETUP_REQUIRED",
                        ),
                    ),
                ),
                outcome,
            )
        }

    @Test
    fun rateLimitCarriesRetryAfter() =
        runBlocking {
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(
                        429,
                    ).addHeader("Retry-After", "12")
                    .body("""{"error":"Too many.","code":"RATE_LIMITED"}""")
                    .build(),
            )
            val outcome = client().stream("/api/ai/chat", Body("Hi")) {}
            assertEquals(Outcome.Failure(AppError.RateLimited(ServerMessage("Too many.", "RATE_LIMITED"), 12.seconds)), outcome)
        }

    @Test
    fun unauthorizedRejectsTheToken() =
        runBlocking {
            val credentials = Credentials()
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(401)
                    .body("""{"error":"Sign in.","code":"UNAUTHENTICATED"}""")
                    .build(),
            )
            val outcome = client(credentials).stream("/api/ai/chat", Body("Hi")) {}
            assertTrue((outcome as Outcome.Failure).error is AppError.Unauthorized)
            assertEquals(listOf("token-abc"), credentials.rejected)
        }

    @Test
    fun aStreamThatClosesWithoutAReplyJustEnds() =
        runBlocking {
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(200)
                    .body("data: {\"type\":\"accepted\"}\n\n")
                    .build(),
            )
            val events = mutableListOf<ChatEvent>()
            assertEquals(Outcome.Success(Unit), client().stream("/api/ai/chat", Body("Hi")) { events += it })
            assertEquals(listOf<ChatEvent>(ChatEvent.Accepted), events)
        }

    @Test
    fun silenceAfterTheStreamOpensIsATimeout() =
        runBlocking {
            server.enqueue(
                MockResponse
                    .Builder()
                    .code(200)
                    .body("data: {\"type\":\"accepted\"}\n\n")
                    .bodyDelay(2, TimeUnit.SECONDS)
                    .build(),
            )
            val outcome = client(silence = 200.milliseconds).stream("/api/ai/chat", Body("Hi")) {}
            assertEquals(Outcome.Failure(AppError.Timeout), outcome)
        }
}
