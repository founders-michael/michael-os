package com.michaelos.feature.goals

import com.michaelos.core.model.GoalResponse
import com.michaelos.core.model.GoalSave
import com.michaelos.core.model.apiJson
import com.michaelos.core.testing.ContractExamples
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class GoalRulesTest {
    private fun goal(name: String) = apiJson.decodeFromString<GoalResponse>(ContractExamples.example(name)).goal

    private val today = LocalDate.of(2026, 11, 28)

    @Test
    fun michaelsReadMatchesTheWebsRules() {
        val goal = goal("goal-get.json")
        val read = GoalRead.of(goal, today)
        assertEquals(33, read.milestonePercent)
        assertEquals(GoalRead.Standing.InStep, read.standing)
        assertEquals("My Day", read.nextMilestone)
        assertFalse(read.targetPassed)

        assertEquals(GoalRead.Standing.Drift(ahead = true), GoalRead.of(goal.copy(progress = 80), today).standing)
        assertEquals(GoalRead.Standing.Drift(ahead = false), GoalRead.of(goal.copy(progress = 23), today).standing)
        assertEquals(GoalRead.Standing.InStep, GoalRead.of(goal.copy(progress = 24), today).standing)
        assertTrue(GoalRead.of(goal, LocalDate.of(2027, 3, 1)).targetPassed)
    }

    @Test
    fun aCompletedGoalsFormLeavesProgressOut() {
        val save = GoalForm.of(goal("goal-complete.json")).save
        val body = apiJson.encodeToString(GoalSave.serializer(), requireNotNull(save))
        assertFalse(body.contains("progress"))
        assertTrue(body.contains("\"targetDate\":null"))

        assertNull(GoalForm.of(goal("goal-get.json")).copy(title = "  ").save)
    }

    @Test
    fun theTargetCountsDaysOnlyForAnActiveGoal() {
        val goal = goal("goal-get.json")
        val target = LocalDate.of(2027, 2, 28)
        assertEquals(GoalTarget.Today, GoalTarget.of(goal, target))
        assertEquals(GoalTarget.InDays(9), GoalTarget.of(goal, LocalDate.of(2027, 2, 19)))
        assertEquals(GoalTarget.Passed(target), GoalTarget.of(goal, LocalDate.of(2027, 3, 1)))
        assertEquals(GoalTarget.OnDate(target), GoalTarget.of(goal, today))
    }
}
