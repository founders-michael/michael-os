package com.michaelos.feature.habits

import com.michaelos.core.model.HabitFrequency
import com.michaelos.core.model.HabitList
import com.michaelos.core.model.HabitResponse
import com.michaelos.core.model.HabitSave
import com.michaelos.core.model.HabitStatus
import com.michaelos.core.model.apiJson
import com.michaelos.core.model.isMissedOn
import com.michaelos.core.testing.ContractExamples
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalTime

class HabitRulesTest {
    private val base = apiJson.decodeFromString<HabitList>(ContractExamples.example("habits-list.json")).habits.first()

    private fun habit(
        id: String,
        streak: Int,
        best: Int,
        scheduled: Boolean = true,
        done: Boolean = false,
    ) = base.copy(
        id = id,
        currentStreak = streak,
        bestStreak = best,
        todayScheduled = scheduled,
        completedToday = done,
        status = HabitStatus.Active,
    )

    @Test
    fun everyHabitExampleDecodes() {
        listOf("habit-create-scheduled.json", "habit-patch.json", "habit-archive.json", "habit-reactivate.json", "habit-get.json").forEach {
            apiJson.decodeFromString<HabitResponse>(ContractExamples.example(it))
        }
    }

    @Test
    fun michaelsLinePicksTheDueHabitWithTheLongestStreak() {
        val long = habit("long", streak = 6, best = 6)
        assertEquals(HabitLine.Next(long), HabitLine.of(listOf(habit("short", streak = 2, best = 9), long)))
        assertEquals(HabitLine.Record.Best, HabitLine.record(long))
        assertEquals(HabitLine.Record.MatchesBest, HabitLine.record(habit("a", streak = 4, best = 5)))
        assertEquals(HabitLine.Record.None, HabitLine.record(habit("b", streak = 1, best = 5)))
    }

    @Test
    fun michaelsLineWhenNothingIsDue() {
        assertEquals(HabitLine.AllDone, HabitLine.of(listOf(habit("a", 3, 3, done = true))))
        assertEquals(HabitLine.NothingToday, HabitLine.of(listOf(habit("a", 3, 3, scheduled = false))))
        assertNull(HabitLine.of(listOf(base.copy(status = HabitStatus.Archived))))
    }

    @Test
    fun theScheduleRulesMatchTheServer() {
        val seven = LocalTime.of(7, 0)
        var schedule = HabitSchedule(frequency = HabitFrequency.SelectedDays)
        assertEquals(HabitSchedule.Problem.NoWeekday, schedule.problem)
        schedule = schedule.copy(weekdays = setOf(1), endTime = seven)
        assertEquals(HabitSchedule.Problem.EndWithoutStart, schedule.problem)
        schedule = schedule.copy(startTime = seven)
        assertEquals(HabitSchedule.Problem.EndEqualsStart, schedule.problem)
        schedule = schedule.copy(startTime = LocalTime.of(23, 0))
        assertNull(schedule.problem)
        assertTrue(schedule.runsPastMidnight)
    }

    @Test
    fun onlyDaysInsideTheStatsPeriodCountAsMissed() {
        val habit = base.copy(frequency = HabitFrequency.Daily, periodStart = base.today.minusDays(2), checkIns = emptyList())
        assertFalse(habit.isMissedOn(base.today.minusDays(3)))
        assertTrue(habit.isMissedOn(base.today.minusDays(1)))
        assertFalse(habit.isMissedOn(base.today))
    }

    @Test
    fun aDailyHabitSendsNoWeekdays() {
        val form = HabitForm(title = " Read 20 pages ", schedule = HabitSchedule(weekdays = setOf(3)))
        assertEquals(HabitSave("Read 20 pages", null, HabitFrequency.Daily, emptyList(), null, null), form.save)
    }
}
