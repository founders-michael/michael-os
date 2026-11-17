package com.michaelos.feature.auth

/**
 * The server's password rule, shown while typing so the user is never refused for something they could see.
 * Mirrors `meetsPasswordPolicy` in the web app exactly: 12 to 128 UTF-16 code units (JavaScript's `length`, and
 * Kotlin's), an ASCII upper-case letter and an ASCII lower-case letter.
 */
data class PasswordRules(
    val length: Int,
    val hasUppercase: Boolean,
    val hasLowercase: Boolean,
) {
    val hasLength: Boolean get() = length in MINIMUM_LENGTH..MAXIMUM_LENGTH
    val isMet: Boolean get() = hasLength && hasUppercase && hasLowercase

    companion object {
        const val MINIMUM_LENGTH = 12
        const val MAXIMUM_LENGTH = 128

        fun of(password: String) =
            PasswordRules(
                length = password.length,
                hasUppercase = password.any { it in 'A'..'Z' },
                hasLowercase = password.any { it in 'a'..'z' },
            )
    }
}
