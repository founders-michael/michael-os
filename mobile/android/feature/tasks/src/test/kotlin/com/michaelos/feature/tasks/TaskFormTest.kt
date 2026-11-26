package com.michaelos.feature.tasks

import com.michaelos.core.model.FieldChange
import com.michaelos.core.model.RecurrenceFrequency
import com.michaelos.core.model.RecurrenceRule
import com.michaelos.core.model.TaskRecurrence
import com.michaelos.core.testing.task
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

class TaskFormTest {
    private val due = LocalDate.parse("2026-11-24")
    private val weekly = TaskRecurrence(RecurrenceFrequency.Weekly, 1, listOf(2), null, null, true, "Every Tue")

    @Test
    fun eachRuleIsCheckedBeforeAnythingIsSent() {
        var form = TaskForm()
        assertEquals(mapOf(TaskForm.Field.Title to TaskForm.Problem.TitleMissing), form.problems)
        form = form.copy(title = "Call the bank", estimate = "4", remaining = "1441")
        assertEquals(setOf(TaskForm.Field.Estimate, TaskForm.Field.Remaining), form.problems.keys)
        form = form.copy(estimate = "5", remaining = "1440")
        assertTrue(form.problems.isEmpty())
        form = form.copy(repeat = RepeatDraft(RepeatDraft.Preset.Weekly))
        assertEquals(TaskForm.Problem.RepeatNeedsDueDate, form.problems[TaskForm.Field.Recurrence])
        form = form.copy(dueDate = due)
        assertTrue(form.problems.isEmpty())
        form = form.copy(repeat = RepeatDraft(RepeatDraft.Preset.Custom, RecurrenceFrequency.Weekly, weekdays = emptySet()))
        assertEquals(TaskForm.Problem.RepeatNeedsWeekday, form.problems[TaskForm.Field.Recurrence])
        form = form.copy(repeat = form.repeat.copy(weekdays = setOf(1), endsOn = LocalDate.parse("2026-11-20")))
        assertEquals(TaskForm.Problem.EndsBeforeDueDate, form.problems[TaskForm.Field.Recurrence])
        form = form.copy(repeat = form.repeat.copy(endsOn = null), reminderDate = due)
        assertEquals(TaskForm.Problem.ReminderHalfSet, form.problems[TaskForm.Field.Reminder])
        form = form.copy(reminderTime = LocalTime.of(9, 0))
        assertTrue(form.problems.isEmpty())
    }

    @Test
    fun aPastDueDateIsAllowed() {
        assertTrue(TaskForm(title = "Send the investor update", dueDate = LocalDate.parse("2026-11-01")).problems.isEmpty())
    }

    @Test
    fun presetsTakeTheirDayFromTheDueDate() {
        assertEquals(listOf(2), RepeatDraft(RepeatDraft.Preset.Weekly).rule(due)?.weekdays)
        assertEquals(24, RepeatDraft(RepeatDraft.Preset.Monthly).rule(due)?.monthDay)
        assertEquals(listOf(1, 2, 3, 4, 5), RepeatDraft(RepeatDraft.Preset.Weekdays).rule(due)?.weekdays)
        assertEquals(
            RecurrenceRule(RecurrenceFrequency.Monthly, 99, emptyList(), 31, null),
            RepeatDraft(RepeatDraft.Preset.Custom, RecurrenceFrequency.Monthly, interval = 120, monthDay = 31).rule(due),
        )
    }

    @Test
    fun aSavedRepeatOpensAsItsClosestPreset() {
        assertEquals(RepeatDraft.Preset.Weekly, RepeatDraft.of(weekly).preset)
        assertEquals(RepeatDraft.Preset.Custom, RepeatDraft.of(weekly.copy(interval = 2, weekdays = listOf(1, 3))).preset)
        assertEquals(RepeatDraft.Preset.Weekdays, RepeatDraft.of(weekly.copy(weekdays = listOf(1, 2, 3, 4, 5))).preset)
    }

    @Test
    fun anEditSendsTheRepeatAndReminderOnlyWhenTheyChange() {
        val saved = task("a", due = "2026-11-24", recurrence = weekly, remindAt = Instant.parse("2026-11-24T03:30:00Z"))
        val original = TaskForm.of(saved, ZoneId.of("Asia/Kolkata"))
        assertEquals(LocalTime.of(9, 0), original.reminderTime)
        val renamed = checkNotNull(original.copy(title = "Renamed").save(original))
        assertNull(renamed.recurrence)
        assertNull(renamed.reminder)
        val stopped = checkNotNull(original.copy(repeat = RepeatDraft(), reminderDate = null, reminderTime = null).save(original))
        assertEquals(FieldChange.Clear, stopped.recurrence)
        assertEquals(FieldChange.Clear, stopped.reminder)
    }

    @Test
    fun aSentReminderStartsEmpty() {
        val form = TaskForm.of(task("a", remindAt = Instant.now(), reminderSent = true), ZoneId.of("UTC"))
        assertNull(form.reminderDate)
    }
}
