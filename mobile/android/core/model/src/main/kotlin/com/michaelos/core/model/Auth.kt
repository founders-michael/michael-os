@file:UseSerializers(InstantSerializer::class)

package com.michaelos.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.UseSerializers
import java.time.Instant

@Serializable
data class AuthUser(
    val id: String,
    val name: String,
    val email: String,
    val emailVerified: Boolean,
    val image: String? = null,
)

/**
 * Where the emailed verification link sends the browser once it has verified the address: the web app's
 * LifestyleOS sign-in page, as on web. The user then returns to the app and signs in.
 */
const val VERIFICATION_CALLBACK_PATH = "/lifestyle/login"

@Serializable
data class SignInRequest(
    val email: String,
    val password: String,
    val callbackURL: String = VERIFICATION_CALLBACK_PATH,
)

@Serializable
data class SignUpRequest(
    val name: String,
    val email: String,
    val password: String,
    val callbackURL: String = VERIFICATION_CALLBACK_PATH,
)

/** Sign-up answers the same way for a new address and one already registered. */
@Serializable
data class SignUpResponse(
    val user: AuthUser,
)

@Serializable
data class VerificationEmailRequest(
    val email: String,
    val callbackURL: String = VERIFICATION_CALLBACK_PATH,
)

@Serializable
data class StatusResponse(
    val status: Boolean,
)

/**
 * The session token is not read from this body: the body carries the unsigned token, which the server
 * refuses. The signed one arrives in the `set-auth-token` header.
 */
@Serializable
data class SignInResponse(
    val user: AuthUser,
)

/** `GET /api/auth/get-session`. The server answers 200 with `null` when there is no session. */
@Serializable
data class AuthSession(
    val session: Details,
    val user: AuthUser,
) {
    @Serializable
    data class Details(
        val id: String,
        val userId: String,
        val expiresAt: Instant,
    )
}

@Serializable
data class SignOutResponse(
    val success: Boolean,
)
