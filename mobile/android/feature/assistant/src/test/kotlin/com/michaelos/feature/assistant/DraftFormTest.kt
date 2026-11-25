package com.michaelos.feature.assistant

import com.michaelos.core.model.CalendarEventType
import com.michaelos.core.model.DraftKind
import com.michaelos.core.model.DraftValue
import com.michaelos.core.model.GoalCreate
import com.michaelos.core.model.HabitCreate
import com.michaelos.core.model.HabitFrequency
import com.michaelos.core.model.MemoryCreate
import com.michaelos.core.model.MemorySensitivity
import com.michaelos.core.model.RecordDraft
import com.michaelos.core.model.SchedulingMode
import com.michaelos.core.model.TaskCreate
import com.michaelos.core.model.TaskPriority
import com.michaelos.core.model.apiJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime

/** The draft form for each kind, against the web app's draft-model.ts. */
class DraftFormTest {
    private fun form(
        kind: DraftKind,
        values: Map<String, DraftValue>,
        zone: String = "Asia/Kolkata",
    ) = DraftForm.of(RecordDraft(kind, values, zone))

    private fun text(value: String) = DraftValue.Text(value)

    @Test
    fun aTaskOpensWithItsDefaultPriorityAndPostsOnlyWhatIsFilled() {
        var task = form(DraftKind.Task, mapOf("title" to text("  Call the bank  ")))
        assertEquals(listOf("title", "description", "priority", "dueDate", "estimatedDurationMinutes"), task.fields.map { it.name })
        assertEquals("MEDIUM", task.text("priority"))
        assertTrue(task.missing.isEmpty())
        assertEquals(DraftSubmission.Task(TaskCreate("Call the bank", TaskPriority.Medium)), task.submission)
        task =
            task.with("dueDate", text("2026-11-24")).with("estimatedDurationMinutes", DraftValue.Number(45)).with("priority", text("HIGH"))
        assertEquals(
            DraftSubmission.Task(
                TaskCreate("Call the bank", TaskPriority.High, dueDate = LocalDate.parse("2026-11-24"), estimatedDurationMinutes = 45),
            ),
            task.submission,
        )
    }

    @Test
    fun aRequiredFieldClearedByTheUserBlocksTheSave() {
        val task = form(DraftKind.Task, mapOf("title" to text("Call the bank"))).with("title", text("   "))
        assertEquals(listOf("title"), task.missing)
        assertNull(task.submission)
    }

    @Test
    fun aGoalAlwaysSendsProgress() {
        val goal =
            form(DraftKind.Goal, mapOf("title" to text("Run a 10k"), "category" to text("Health"), "targetDate" to text("2027-03-01")))
        assertEquals(listOf("title", "description", "category", "targetDate", "progress"), goal.fields.map { it.name })
        assertEquals(
            DraftSubmission.Goal(GoalCreate("Run a 10k", 0, category = "Health", targetDate = LocalDate.parse("2027-03-01"))),
            goal.submission,
        )
    }

    @Test
    fun aDailyHabitHasNoDaysAndSelectedDaysNeedsOne() {
        var habit = form(DraftKind.Habit, mapOf("title" to text("Stretch"), "weekdays" to DraftValue.Days(listOf(1, 3))))
        assertTrue(habit.days("weekdays").isEmpty())
        assertFalse(habit.fields.any { it.name == "weekdays" })
        habit = habit.with("frequency", text("SELECTED_DAYS"))
        assertTrue(habit.fields.any { it.name == "weekdays" })
        assertEquals(listOf("weekdays"), habit.missing)
        assertNull(habit.submission)
        habit = habit.with("weekdays", DraftValue.Days(listOf(1, 5)))
        assertEquals(DraftSubmission.Habit(HabitCreate("Stretch", HabitFrequency.SelectedDays, listOf(1, 5))), habit.submission)
        assertTrue(habit.with("frequency", text("DAILY")).days("weekdays").isEmpty())
    }

    @Test
    fun aHabitEndTimeNeedsAStartTimeAndDiffersFromIt() {
        var habit = form(DraftKind.Habit, mapOf("title" to text("Walk"), "endTime" to text("07:30")))
        var body = (habit.submission as DraftSubmission.Habit).body
        assertNull(body.startTime)
        assertNull(body.endTime)
        habit = habit.with("startTime", text("07:30"))
        body = (habit.submission as DraftSubmission.Habit).body
        assertEquals(LocalTime.of(7, 30), body.startTime)
        assertNull(body.endTime)
        body = (habit.with("endTime", text("08:00")).submission as DraftSubmission.Habit).body
        assertEquals(LocalTime.of(8, 0), body.endTime)
    }

    @Test
    fun aCalendarEventTurnsItsLocalTimesIntoInstantsInTheDraftsZone() {
        val event =
            form(
                DraftKind.CalendarEvent,
                mapOf("title" to text("Dentist"), "date" to text("2026-11-24"), "startTime" to text("15:00"), "endTime" to text("15:30")),
                zone = "Pacific/Auckland",
            )
        val body = (event.submission as DraftSubmission.CalendarEvent).body
        assertEquals(CalendarEventType.Commitment, body.eventType)
        assertEquals(SchedulingMode.Fixed, body.schedulingMode)
        assertEquals("Pacific/Auckland", body.timeZone)
        assertEquals(Instant.parse("2026-11-24T02:00:00Z"), body.startAt)
        assertEquals(Duration.ofMinutes(30), Duration.between(body.startAt, body.endAt))
        assertTrue(apiJson.encodeToString(body).contains("\"startAt\":\"2026-11-24T02:00:00Z\""))
    }

    @Test
    fun anEventMustEndAfterItStartsAndNeedsItsRequiredFields() {
        var event = form(DraftKind.CalendarEvent, mapOf("title" to text("Dentist"), "date" to text("2026-11-24")))
        assertEquals(listOf("startTime", "endTime"), event.missing)
        event = event.with("startTime", text("15:00")).with("endTime", text("14:00"))
        assertTrue(event.missing.isEmpty())
        assertNull(event.submission)
    }

    @Test
    fun aWallClockTimeTheZoneSkipsCannotBeSaved() {
        val date = LocalDate.parse("2027-03-14")
        assertNull(DraftForm.instant(date, LocalTime.of(2, 30), "America/New_York"))
        assertNotNull(DraftForm.instant(date, LocalTime.of(3, 30), "America/New_York"))
    }

    @Test
    fun aMemoryKeepsItsPrivacyChoice() {
        val memory = form(DraftKind.Memory, mapOf("content" to text("I prefer deep work before lunch.")))
        assertEquals("STANDARD", memory.text("sensitivity"))
        assertEquals(
            DraftSubmission.Memory(MemoryCreate("I prefer deep work before lunch.", MemorySensitivity.Sensitive)),
            memory.with("sensitivity", text("SENSITIVE")).submission,
        )
    }

    @Test
    fun aDraftOfAnUnknownKindCannotBeSaved() {
        assertNull(form(DraftKind.Unknown, mapOf("title" to text("X"))).submission)
    }

    @Test
    fun serverFieldNamesMapOntoTheForm() {
        assertEquals("startTime", DraftForm.fieldFor("startAt"))
        assertEquals("endTime", DraftForm.fieldFor("endAt"))
        assertEquals("title", DraftForm.fieldFor("title"))
    }
}
