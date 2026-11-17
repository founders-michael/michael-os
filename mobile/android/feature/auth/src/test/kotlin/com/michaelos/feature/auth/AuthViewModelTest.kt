package com.michaelos.feature.auth

import com.michaelos.core.model.AppError
import com.michaelos.core.model.ServerMessage
import com.michaelos.core.testing.FakeAuthRepository
import com.michaelos.core.testing.MainDispatcherRule
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AuthViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    @Test
    fun wrongPasswordFails() {
        val auth = FakeAuthRepository()
        val error = AppError.Unauthorized(ServerMessage("Invalid email or password", "INVALID_EMAIL_OR_PASSWORD"))
        auth.failNext(error)
        val model = SignInViewModel(auth)
        model.signIn(" sam@example.test ", "wrong")
        assertEquals(SignInUiState.Failed(error), model.uiState.value)
        assertEquals(listOf(FakeAuthRepository.Call.SignIn("sam@example.test", "wrong")), auth.calls)
    }

    @Test
    fun unverifiedEmailGoesToCheckYourEmail() {
        val auth = FakeAuthRepository()
        auth.failNext(AppError.Forbidden(ServerMessage("Email not verified", "EMAIL_NOT_VERIFIED")))
        val model = SignInViewModel(auth)
        model.signIn("sam@example.test", "LocalOnly-Sample-2026")
        assertEquals(SignInUiState.NeedsVerification("sam@example.test"), model.uiState.value)
        model.verificationShown()
        assertEquals(SignInUiState.Idle, model.uiState.value)
    }

    @Test
    fun offlineSignInKeepsTheScreenAndSaysSo() {
        val auth = FakeAuthRepository()
        auth.failNext(AppError.Offline)
        val model = SignInViewModel(auth)
        model.signIn("sam@example.test", "x")
        assertEquals(SignInUiState.Failed(AppError.Offline), model.uiState.value)
    }

    @Test
    fun doubleTapSignsInOnce() {
        val auth = FakeAuthRepository()
        val gate = CompletableDeferred<Unit>()
        auth.holdNext(gate)
        val model = SignInViewModel(auth)
        model.signIn("sam@example.test", "p")
        model.signIn("sam@example.test", "p")
        gate.complete(Unit)
        assertEquals(1, auth.calls.size)
        assertEquals(SignInUiState.Idle, model.uiState.value)
    }

    @Test
    fun signInNeedsAnEmailAndAPassword() {
        assertFalse(SignInViewModel.canSubmit("", "p"))
        assertFalse(SignInViewModel.canSubmit("sam", "p"))
        assertFalse(SignInViewModel.canSubmit("sam@example.test", ""))
        assertTrue(SignInViewModel.canSubmit("sam@example.test", "p"))
    }

    @Test
    fun passwordRulesMatchTheServer() {
        data class Case(
            val password: String,
            val length: Boolean,
            val upper: Boolean,
            val lower: Boolean,
        )
        val cases =
            listOf(
                Case("", false, false, false),
                Case("short", false, false, true),
                Case("alllowercase12", true, false, true),
                Case("ALLUPPERCASE12", true, true, false),
                Case("LocalOnly-Sample-2026", true, true, true),
                Case("ÄÖÜÉÈÊËÎÏÔ-äöüé", true, false, false),
                Case("Aa".repeat(65), false, true, true),
            )
        for (case in cases) {
            val rules = PasswordRules.of(case.password)
            assertEquals(case.password, case.length, rules.hasLength)
            assertEquals(case.password, case.upper, rules.hasUppercase)
            assertEquals(case.password, case.lower, rules.hasLowercase)
            assertEquals(case.password, case.length && case.upper && case.lower, rules.isMet)
        }
    }

    @Test
    fun registerGoesToCheckYourEmailEvenForAnExistingAddress() {
        val auth = FakeAuthRepository()
        val model = RegisterViewModel(auth)
        model.register(" Sam Rivera ", "sam@example.test ", "LocalOnly-Sample-2026")
        assertEquals(RegisterUiState.Registered("sam@example.test"), model.uiState.value)
        assertEquals(listOf(FakeAuthRepository.Call.Register("Sam Rivera", "sam@example.test", "LocalOnly-Sample-2026")), auth.calls)
    }

    @Test
    fun registerRefusesAPasswordThatBreaksTheRule() {
        val auth = FakeAuthRepository()
        val model = RegisterViewModel(auth)
        model.register("Sam", "sam@example.test", "short")
        assertTrue(auth.calls.isEmpty())
        assertEquals(RegisterUiState.Idle, model.uiState.value)
    }

    @Test
    fun resendWaitsForTheCooldownThenSends() {
        val auth = FakeAuthRepository()
        val model = CheckEmailViewModel("sam@example.test", auth)
        model.resend()
        assertTrue(auth.calls.isEmpty())
        main.dispatcher.scheduler.advanceTimeBy(CheckEmailViewModel.COOLDOWN_SECONDS * 1_000L + 1)
        main.dispatcher.scheduler.runCurrent()
        assertEquals(CheckEmailUiState.Ready, model.uiState.value)
        model.resend()
        assertEquals(listOf(FakeAuthRepository.Call.ResendVerification("sam@example.test")), auth.calls)
        assertEquals(CheckEmailUiState.CoolingDown(CheckEmailViewModel.COOLDOWN_SECONDS), model.uiState.value)
    }

    @Test
    fun failedResendCanBeTriedAgain() {
        val auth = FakeAuthRepository()
        val model = CheckEmailViewModel("sam@example.test", auth)
        main.dispatcher.scheduler.advanceTimeBy(CheckEmailViewModel.COOLDOWN_SECONDS * 1_000L + 1)
        main.dispatcher.scheduler.runCurrent()
        auth.failNext(AppError.Offline)
        model.resend()
        assertEquals(CheckEmailUiState.Failed(AppError.Offline), model.uiState.value)
        model.resend()
        assertEquals(2, auth.calls.size)
        assertTrue(model.uiState.value is CheckEmailUiState.CoolingDown)
    }
}
