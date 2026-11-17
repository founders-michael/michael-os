package com.michaelos.core.testing

import com.michaelos.core.data.AuthRepository
import com.michaelos.core.data.ProfileRepository
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.Profile
import com.michaelos.core.model.ProfileUpdate
import com.michaelos.core.model.ServerMessage
import kotlinx.coroutines.CompletableDeferred
import java.time.Instant

/** Records calls and answers with whatever the test set. A failure or a hold applies to the next call only. */
class FakeAuthRepository : AuthRepository {
    sealed interface Call {
        data class SignIn(
            val email: String,
            val password: String,
        ) : Call

        data class Register(
            val name: String,
            val email: String,
            val password: String,
        ) : Call

        data class ResendVerification(
            val email: String,
        ) : Call

        data object SignOut : Call
    }

    val calls = mutableListOf<Call>()
    private var failure: AppError? = null
    private var hold: CompletableDeferred<Unit>? = null

    fun failNext(error: AppError) {
        failure = error
    }

    /** The next call waits until [gate] completes, so a test can tap twice while one is in flight. */
    fun holdNext(gate: CompletableDeferred<Unit>) {
        hold = gate
    }

    private suspend fun record(call: Call): Outcome<Unit> {
        calls += call
        val error = failure
        val gate = hold
        failure = null
        hold = null
        gate?.await()
        return if (error != null) Outcome.Failure(error) else Outcome.Success(Unit)
    }

    override suspend fun signIn(
        email: String,
        password: String,
    ) = record(Call.SignIn(email, password))

    override suspend fun register(
        name: String,
        email: String,
        password: String,
    ) = record(Call.Register(name, email, password))

    override suspend fun resendVerification(email: String) = record(Call.ResendVerification(email))

    override suspend fun signOut() {
        record(Call.SignOut)
    }
}

class FakeProfileRepository(
    var profile: Profile? = null,
) : ProfileRepository {
    val saved = mutableListOf<ProfileUpdate>()
    var completes = 0
        private set
    private val failures = ArrayDeque<AppError>()

    /** The next calls fail with these, in order. */
    fun failNext(vararg errors: AppError) {
        failures.addAll(errors)
    }

    override suspend fun profile(): Outcome<Profile?> =
        failures.removeFirstOrNull()?.let { Outcome.Failure(it) } ?: Outcome.Success(profile)

    override suspend fun save(update: ProfileUpdate): Outcome<Profile> {
        failures.removeFirstOrNull()?.let { return Outcome.Failure(it) }
        saved += update
        val stored = update.toProfile(completed = false)
        profile = stored
        return Outcome.Success(stored)
    }

    override suspend fun complete(): Outcome<Profile> {
        failures.removeFirstOrNull()?.let { return Outcome.Failure(it) }
        val current = profile
        if (current == null || current.onboardingStep < LAST_SERVER_STEP) {
            return Outcome.Failure(AppError.Validation(ServerMessage("Save your onboarding details before finishing."), emptyMap()))
        }
        completes += 1
        val done = current.copy(onboardingCompleted = true)
        profile = done
        return Outcome.Success(done)
    }

    private companion object {
        const val LAST_SERVER_STEP = 5
    }
}

/** What the server stores for a save. */
fun ProfileUpdate.toProfile(completed: Boolean): Profile =
    Profile(
        userId = "user-1",
        preferredName = preferredName,
        timeZone = timeZone,
        wakeUpTime = wakeUpTime,
        bedtime = bedtime,
        workStartTime = workStartTime,
        workEndTime = workEndTime,
        workDays = workDays,
        priorities = priorities,
        focusSessionMinutes = focusSessionMinutes,
        breakDurationMinutes = breakDurationMinutes,
        planningStyle = planningStyle,
        onboardingStep = onboardingStep,
        onboardingCompleted = completed,
        createdAt = Instant.EPOCH,
        updatedAt = Instant.EPOCH,
    )
