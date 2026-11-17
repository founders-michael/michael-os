package com.michaelos.core.auth

import app.cash.turbine.test
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.ServerMessage
import com.michaelos.core.model.TaskPage
import com.michaelos.core.network.ApiClient
import com.michaelos.core.network.ApiRequest
import com.michaelos.core.network.NetworkModule
import com.michaelos.core.testing.ContractExamples
import com.michaelos.core.testing.FakeTokenStore
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import kotlin.time.Duration

@OptIn(ExperimentalCoroutinesApi::class)
class SessionTest {
    private val server = MockWebServer()

    @Before
    fun start() = server.start()

    @After
    fun stop() = server.close()

    private fun client(session: Session) = ApiClient(server.url("/"), session, NetworkModule.okHttpClient(), Duration.ZERO, log = {})

    private fun respond(
        code: Int,
        body: String,
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
    fun restoresFromTheStoredToken() =
        runTest {
            Session(FakeTokenStore("stored"), backgroundScope, log = {}).state.test {
                assertEquals(SessionState.Restoring, awaitItem())
                assertEquals(SessionState.SignedIn, awaitItem())
            }
            Session(FakeTokenStore(), backgroundScope, log = {}).state.test {
                assertEquals(SessionState.Restoring, awaitItem())
                assertEquals(SessionState.SignedOut, awaitItem())
            }
        }

    @Test
    fun beginSavesAndEndDeletes() =
        runTest {
            val store = FakeTokenStore()
            val session = Session(store, backgroundScope, log = {})
            advanceUntilIdle()
            session.begin("fresh")
            assertEquals(SessionState.SignedIn, session.state.value)
            assertEquals("fresh", store.read())
            session.end()
            assertEquals(SessionState.SignedOut, session.state.value)
            assertNull(store.read())
            assertNull(session.currentToken())
        }

    @Test
    fun threeConcurrentUnauthorizedResponsesSignOutOnce() {
        val store = FakeTokenStore("expired")
        val scope = TestScope(StandardTestDispatcher())
        val session = Session(store, scope, log = {})
        scope.advanceUntilIdle()
        val body = ContractExamples.example("tasks-list-401.json")
        repeat(3) { respond(401, body) }
        val client = client(session)

        runBlocking {
            List(3) { async { client.send(ApiRequest.get<TaskPage>("/api/tasks")) } }.awaitAll()
        }
        scope.advanceUntilIdle()

        assertEquals(3, server.requestCount)
        assertEquals(SessionState.SignedOut, session.state.value)
        assertEquals(1, store.deletes)
    }

    @Test
    fun lateUnauthorizedForAReplacedTokenIsIgnored() =
        runTest {
            val store = FakeTokenStore("old")
            val session = Session(store, backgroundScope, log = {})
            advanceUntilIdle()
            session.begin("new")
            session.reject("old")
            advanceUntilIdle()
            assertEquals(SessionState.SignedIn, session.state.value)
            assertEquals("new", session.currentToken())
            assertEquals(0, store.deletes)
        }

    @Test
    fun signInKeepsTheHeaderToken() =
        runBlocking {
            respond(200, ContractExamples.example("auth-sign-in.json"), "set-auth-token" to "signed.token")
            val store = FakeTokenStore()
            val session = Session(store, this, log = {})
            val outcome = Authenticator(client(session), session).signIn("sam@example.test", "LocalOnly-Sample-2026")
            assertEquals("Sam Rivera", (outcome as Outcome.Success).value.name)
            assertEquals(SessionState.SignedIn, session.state.value)
            assertEquals("signed.token", store.read())
            assertNull(server.takeRequest().headers["Authorization"])
        }

    @Test
    fun signInWithoutTheHeaderIsADecodingFailure() =
        runBlocking {
            respond(200, ContractExamples.example("auth-sign-in.json"))
            val session = Session(FakeTokenStore(), this, log = {})
            assertEquals(Outcome.Failure(AppError.Decoding), Authenticator(client(session), session).signIn("sam@example.test", "x"))
            assertNull(session.currentToken())
        }

    @Test
    fun wrongPasswordDoesNotTouchTheSession() =
        runBlocking {
            respond(401, ContractExamples.example("auth-sign-in-wrong-password-401.json"))
            val store = FakeTokenStore()
            val session = Session(store, this, log = {})
            assertEquals(
                Outcome.Failure(AppError.Unauthorized(ServerMessage("Invalid email or password", "INVALID_EMAIL_OR_PASSWORD"))),
                Authenticator(client(session), session).signIn("sam@example.test", "wrong"),
            )
            assertEquals(0, store.deletes)
        }

    @Test
    fun signOutEndsTheSessionEvenWhenTheServerIsUnreachable() =
        runBlocking {
            val store = FakeTokenStore("live")
            val session = Session(store, this, log = {})
            val unreachable = ApiClient("http://127.0.0.1:9/".toHttpUrl(), session, NetworkModule.okHttpClient(), Duration.ZERO, log = {})
            Authenticator(unreachable, session).signOut()
            assertEquals(SessionState.SignedOut, session.state.value)
            assertNull(store.read())
        }
}
