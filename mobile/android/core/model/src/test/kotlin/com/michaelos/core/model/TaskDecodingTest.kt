package com.michaelos.core.model

import kotlinx.serialization.decodeFromString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime

class TaskDecodingTest {
    private fun example(name: String) = File(checkNotNull(System.getProperty("contract.path")), "examples/$name").readText()

    private fun task(name: String) = apiJson.decodeFromString<TaskResponse>(example(name)).task

    @Test
    fun aRepeatingTaskWithAReminder() {
        val created = task("task-create-repeating.json")
        val recurrence = checkNotNull(created.activeRecurrence)
        assertEquals(RecurrenceFrequency.Weekly, recurrence.frequency)
        assertEquals(listOf(1, 4), recurrence.weekdays)
        assertEquals("Every Mon, Thu", recurrence.label)
        assertEquals(Instant.parse("2026-11-26T19:30:00Z"), created.remindAt)
        assertNotNull(created.pendingReminder)
    }

    @Test
    fun aStoppedRepeatIsKeptButNotActive() {
        val stopped = task("task-patch-stop-repeat.json")
        assertEquals(false, stopped.recurrence?.active)
        assertNull(stopped.activeRecurrence)
        assertNull(stopped.remindAt)
    }

    @Test
    fun editSkipListSummaryAndDelete() {
        assertEquals(15, task("task-patch-edit.json").recurrence?.monthDay)
        assertEquals(LocalDate.parse("2027-01-15"), task("task-skip.json").dueDate)
        val page = apiJson.decodeFromString<TaskPage>(example("tasks-list-filtered.json"))
        assertTrue(page.tasks.all { it.priority == TaskPriority.High && it.status != TaskStatus.Completed })
        assertEquals(
            LocalDate.parse("2026-11-17"),
            apiJson.decodeFromString<TaskSummaryResponse>(example("tasks-summary.json")).summary.today,
        )
        assertTrue(apiJson.decodeFromString<TaskDeleted>(example("task-delete.json")).success)
    }

    @Test
    fun responsesFromBeforeRepeatsStillDecode() {
        val old = task("task-get.json")
        assertNull(old.recurrence)
        assertNull(old.remindAt)
        assertFalse(old.reminderSent)
    }

    @Test
    fun theSaveSendsPlainFieldsAlwaysAndRepeatAndReminderOnlyWhenChanged() {
        val due = LocalDate.parse("2026-11-27")
        val unchanged = TaskSave("Water the plants", null, TaskPriority.Low, 15, null, due, null, null)
        assertEquals(
            """{"title":"Water the plants","description":null,"priority":"LOW","estimatedDurationMinutes":15,""" +
                """"remainingDurationMinutes":null,"dueDate":"2026-11-27"}""",
            apiJson.encodeToString(TaskSave.serializer(), unchanged),
        )
        val changed =
            unchanged.copy(
                recurrence = FieldChange.Set(RecurrenceRule(RecurrenceFrequency.Weekly, 1, listOf(1, 4), null, null)),
                reminder = FieldChange.Clear,
            )
        val body = apiJson.encodeToString(TaskSave.serializer(), changed)
        assertTrue(
            body,
            body.contains(""""recurrence":{"frequency":"WEEKLY","interval":1,"weekdays":[1,4],"monthDay":null,"endsOn":null}"""),
        )
        assertTrue(body.contains(""""reminder":null"""))
        val reminder = unchanged.copy(reminder = FieldChange.Set(ReminderTime(due, LocalTime.of(8, 30))))
        assertTrue(apiJson.encodeToString(TaskSave.serializer(), reminder).contains(""""reminder":{"date":"2026-11-27","time":"08:30"}"""))
    }

    @Test
    fun theQuerySendsOnlyWhatIsSet() {
        assertEquals(listOf("view" to "all", "sort" to "recent", "page" to "1", "limit" to "30"), TaskQuery().parameters)
        assertEquals(
            listOf("view" to "overdue", "sort" to "dueDate", "page" to "2", "limit" to "30", "priority" to "HIGH", "search" to "invest"),
            TaskQuery(TaskView.Overdue, TaskPriority.High, TaskSort.DueDate, "  invest  ", 2).parameters,
        )
    }
}
