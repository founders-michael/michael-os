package com.michaelos.feature.settings

import com.michaelos.core.model.Account
import com.michaelos.core.model.AccountUpdate
import com.michaelos.core.model.PersonalContext
import com.michaelos.core.model.PersonalContextSave

/** The two names the user may change. Rules mirror `account-validation.ts`; the server checks them again. */
data class AccountForm(
    val fullName: String,
    val preferredName: String,
) {
    enum class Problem { Missing, TooLong }

    val save: AccountUpdate?
        get() =
            if (problem(fullName) == null && problem(preferredName) == null) {
                AccountUpdate(normalized(fullName), normalized(preferredName))
            } else {
                null
            }

    companion object {
        const val NAME_LIMIT = 80

        fun of(account: Account) = AccountForm(account.fullName, account.preferredName)

        /** Runs of spaces become one and the ends are trimmed, as the server stores it. */
        fun normalized(name: String): String =
            name
                .trim()
                .split(Regex("\\s+"))
                .filter { it.isNotEmpty() }
                .joinToString(" ")

        fun problem(name: String): Problem? {
            val normalized = normalized(name)
            return when {
                normalized.isEmpty() -> Problem.Missing
                normalized.length > NAME_LIMIT -> Problem.TooLong
                else -> null
            }
        }
    }
}

/** My Context as the editor holds it, with the version it was loaded at. */
data class ContextDraft(
    val text: String,
    val version: String?,
) {
    val count: Int get() = normalized(text).length
    val isTooLong: Boolean get() = count > LIMIT

    fun save(over: String?) = PersonalContextSave(normalized(text), over)

    companion object {
        const val LIMIT = 5000

        fun of(context: PersonalContext) = ContextDraft(context.summary, context.updatedAt)

        /** What the server stores and counts: Windows line endings become `\n`, trailing space is dropped. */
        fun normalized(text: String): String = text.replace("\r\n", "\n").replace("\r", "\n").trimEnd()
    }
}

/** Deleting the account asks for the password and for this word typed exactly. */
object DeleteConfirmation {
    const val WORD = "DELETE"

    fun isReady(
        password: String,
        typed: String,
    ): Boolean = password.isNotEmpty() && typed == WORD
}
