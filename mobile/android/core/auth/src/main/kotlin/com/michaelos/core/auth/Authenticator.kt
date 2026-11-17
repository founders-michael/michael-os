package com.michaelos.core.auth

import com.michaelos.core.model.AppError
import com.michaelos.core.model.AuthUser
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.SignInRequest
import com.michaelos.core.model.SignInResponse
import com.michaelos.core.model.SignOutResponse
import com.michaelos.core.network.ApiClient
import com.michaelos.core.network.ApiRequest
import com.michaelos.core.network.EmptyBody

/** Email sign-in and sign-out against Better Auth. */
class Authenticator(
    private val client: ApiClient,
    private val session: Session,
) {
    /** A wrong password is [AppError.Unauthorized]; an unverified email is [AppError.Forbidden] with code `EMAIL_NOT_VERIFIED`. */
    suspend fun signIn(
        email: String,
        password: String,
    ): Outcome<AuthUser> =
        when (
            val outcome =
                client.send(
                    ApiRequest.post<SignInResponse, SignInRequest>("/api/auth/sign-in/email", SignInRequest(email, password)),
                )
        ) {
            is Outcome.Failure -> {
                outcome
            }

            is Outcome.Success -> {
                val token = outcome.value.header("set-auth-token")
                if (token.isNullOrEmpty()) {
                    Outcome.Failure(AppError.Decoding)
                } else {
                    session.begin(token)
                    Outcome.Success(outcome.value.value.user)
                }
            }
        }

    /**
     * Signs out on this device even when the server cannot be reached; the server session then lasts until it
     * expires.
     */
    suspend fun signOut() {
        client.send(ApiRequest.post<SignOutResponse, EmptyBody>("/api/auth/sign-out", EmptyBody))
        session.end()
    }
}
