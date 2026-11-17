package com.michaelos.core.data

import com.michaelos.core.auth.Authenticator
import com.michaelos.core.model.Outcome
import javax.inject.Inject

/** What the sign-in and register screens need. */
interface AuthRepository {
    suspend fun signIn(
        email: String,
        password: String,
    ): Outcome<Unit>

    suspend fun register(
        name: String,
        email: String,
        password: String,
    ): Outcome<Unit>

    suspend fun resendVerification(email: String): Outcome<Unit>

    suspend fun signOut()
}

class RemoteAuthRepository
    @Inject
    constructor(
        private val authenticator: Authenticator,
    ) : AuthRepository {
        override suspend fun signIn(
            email: String,
            password: String,
        ): Outcome<Unit> =
            when (val outcome = authenticator.signIn(email, password)) {
                is Outcome.Success -> Outcome.Success(Unit)
                is Outcome.Failure -> outcome
            }

        override suspend fun register(
            name: String,
            email: String,
            password: String,
        ): Outcome<Unit> = authenticator.register(name, email, password)

        override suspend fun resendVerification(email: String): Outcome<Unit> = authenticator.resendVerification(email)

        override suspend fun signOut() = authenticator.signOut()
    }
