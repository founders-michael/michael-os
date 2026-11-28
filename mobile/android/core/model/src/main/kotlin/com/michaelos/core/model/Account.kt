package com.michaelos.core.model

import kotlinx.serialization.Serializable

/** `GET /api/account`: the signed-in user's own details. Email is not editable. */
@Serializable
data class Account(
    val fullName: String,
    val email: String,
    val preferredName: String,
    /** Sign-in methods; `credential` is email and password. */
    val providers: List<String>,
    val hasCustomImage: Boolean,
    val identity: AccountIdentity,
)

/** How every screen shows the user. */
@Serializable
data class AccountIdentity(
    val displayName: String,
    val initials: String,
    /** A custom picture's URL is the session-only `/api/account/image` with a version; a provider's is public. */
    val avatarUrl: String? = null,
    val avatarSource: AvatarSource = AvatarSource.None,
)

@Serializable(with = AvatarSourceSerializer::class)
enum class AvatarSource(
    override val wire: String,
) : OpenEnum {
    Custom("custom"),
    Provider("provider"),
    None("none"),
    Unknown("unknown"),
}

internal object AvatarSourceSerializer : OpenEnumSerializer<AvatarSource>("AvatarSource", AvatarSource.entries, AvatarSource.Unknown)

@Serializable
data class AccountResponse(
    val account: Account,
)

/** `PATCH /api/account`. */
@Serializable
data class AccountUpdate(
    val fullName: String,
    val preferredName: String,
)

/** My Context: the text Michael reads about the user, and the version it was saved at (null before the first save). */
@Serializable
data class PersonalContext(
    val summary: String,
    /** Kept as the server wrote it: the server compares it to the millisecond, so it is never re-encoded. */
    val updatedAt: String? = null,
)

@Serializable
data class PersonalContextResponse(
    val context: PersonalContext,
)

/** `PUT /api/account/context`. The server refuses it with 409 when the saved version is newer than [expectedUpdatedAt]. */
@Serializable
data class PersonalContextSave(
    val summary: String,
    val expectedUpdatedAt: String?,
)

/** `POST /api/auth/delete-user`. */
@Serializable
data class DeleteAccountRequest(
    val password: String,
)
