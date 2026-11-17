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

@Serializable
data class SignInRequest(
    val email: String,
    val password: String,
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
