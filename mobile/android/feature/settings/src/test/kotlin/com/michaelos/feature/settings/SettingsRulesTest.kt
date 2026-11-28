package com.michaelos.feature.settings

import com.michaelos.core.model.AccountResponse
import com.michaelos.core.model.AccountUpdate
import com.michaelos.core.model.PersonalContextResponse
import com.michaelos.core.model.PersonalContextSave
import com.michaelos.core.model.apiJson
import com.michaelos.core.testing.ContractExamples
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsRulesTest {
    @Test
    fun contextIsCountedAndSavedAsTheServerStoresIt() {
        val saved = apiJson.decodeFromString<PersonalContextResponse>(ContractExamples.example("context-put.json")).context
        val draft = ContextDraft.of(saved).copy(text = "Mornings.\r\nNo calls before ten.  \n")
        assertEquals("Mornings.\nNo calls before ten.".length, draft.count)
        val body = apiJson.encodeToString(PersonalContextSave.serializer(), draft.save(draft.version))
        assertTrue(body.contains("\"expectedUpdatedAt\":\"2026-11-28T08:20:12.043Z\""))
        assertTrue(draft.copy(text = "a".repeat(ContextDraft.LIMIT + 1)).isTooLong)
    }

    @Test
    fun namesAreCollapsedAndBounded() {
        val account = apiJson.decodeFromString<AccountResponse>(ContractExamples.example("account-get.json")).account
        val form = AccountForm.of(account).copy(fullName = "  Sam   Rivera ")
        assertEquals(AccountUpdate("Sam Rivera", "Sam"), form.save)
        assertNull(form.copy(preferredName = "   ").save)
        assertEquals(AccountForm.Problem.TooLong, AccountForm.problem("x".repeat(81)))
        assertFalse(DeleteConfirmation.isReady("secret", "delete"))
        assertTrue(DeleteConfirmation.isReady("secret", "DELETE"))
    }
}
