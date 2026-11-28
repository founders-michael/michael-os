package com.michaelos.feature.settings

import com.michaelos.core.model.AccountResponse
import com.michaelos.core.model.AccountUpdate
import com.michaelos.core.model.Availability
import com.michaelos.core.model.AvailabilityUpdate
import com.michaelos.core.model.PersonalContextResponse
import com.michaelos.core.model.PersonalContextSave
import com.michaelos.core.model.ProfileResponse
import com.michaelos.core.model.RoutineUpdate
import com.michaelos.core.model.apiJson
import com.michaelos.core.testing.ContractExamples
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalTime

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

    @Test
    fun availabilityRefusesOverlapsAndWindowsCrossingMidnight() {
        val saved = apiJson.decodeFromString<Availability>(ContractExamples.example("availability-put.json")).stored()
        assertNull(saved.windows.first().id)
        var plan = AvailabilityPlan.of(saved)
        val (withMorning, morning) = plan.add(2)
        val (withBoth, afternoon) = withMorning.add(2)
        plan = withBoth
        assertTrue(plan.save != null)
        plan = plan.update(afternoon!!) { it.copy(startTime = LocalTime.of(12, 30)) }
        assertEquals(AvailabilityPlan.Problem.Overlap, plan.problem(afternoon))
        assertEquals(AvailabilityPlan.Problem.Overlap, plan.problem(morning!!))
        assertNull(plan.save)
        plan = plan.update(afternoon) { it.copy(startTime = LocalTime.of(17, 0)) }
        assertNull(plan.problem(afternoon))
        plan = plan.update(afternoon) { it.copy(endTime = LocalTime.of(2, 0)) }
        assertEquals(AvailabilityPlan.Problem.Order, plan.problem(afternoon))
        val body = apiJson.encodeToString(AvailabilityUpdate.serializer(), plan.remove(afternoon).save!!)
        assertFalse(body.contains("\"id\""))
    }

    @Test
    fun routineSendsWorkHoursAsBothOrNeither() {
        val profile = apiJson.decodeFromString<ProfileResponse>(ContractExamples.example("profile-get.json")).profile!!
        val form = RoutineForm.of(profile).copy(hasWorkHours = false)
        val body = apiJson.encodeToString(RoutineUpdate.serializer(), form.save!!)
        assertTrue(body.contains("\"workStartTime\":null") && body.contains("\"workEndTime\":null"))
        assertFalse(body.contains("preferredName"))
        assertNull(form.copy(hasWorkHours = true, workStartTime = LocalTime.of(18, 0), workEndTime = LocalTime.of(9, 0)).save)
        val (added, problem) = form.copy(priorities = emptyList()).addPriority("  Health ")
        assertNull(problem)
        assertEquals(listOf("Health"), added.priorities)
        assertEquals(RoutineForm.PriorityProblem.Duplicate, added.addPriority("health").second)
    }

    @Test
    fun picturesAreRecognisedByTheirBytes() {
        assertEquals("image/jpeg", PictureRules.contentType(byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte())))
        assertNull(PictureRules.contentType("<svg></svg>".toByteArray()))
        assertFalse(PictureRules.isAccepted(byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte()) + ByteArray(PictureRules.MAX_BYTES)))
    }
}
