package com.michaelos.core.model

import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.nullable
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeParseException

class DecodingTest {
    private fun example(name: String) = File(checkNotNull(System.getProperty("contract.path")), "examples/$name").readText()

    @Test
    fun signIn() {
        val response = apiJson.decodeFromString<SignInResponse>(example("auth-sign-in.json"))
        assertEquals("sam@example.test", response.user.email)
        assertTrue(response.user.emailVerified)
        assertNull(response.user.image)
    }

    @Test
    fun session() {
        val session = apiJson.decodeFromString(AuthSession.serializer().nullable, example("auth-get-session.json"))
        assertEquals(session!!.user.id, session.session.userId)
        assertNull(apiJson.decodeFromString(AuthSession.serializer().nullable, example("auth-get-session-signed-out.json")))
    }

    @Test
    fun signUpAndResend() {
        assertEquals(false, apiJson.decodeFromString<SignUpResponse>(example("auth-sign-up.json")).user.emailVerified)
        assertTrue(apiJson.decodeFromString<StatusResponse>(example("auth-send-verification-email.json")).status)
    }

    @Test
    fun requestsSendTheirFixedCallback() {
        assertTrue(
            apiJson
                .encodeToString(
                    SignInRequest.serializer(),
                    SignInRequest("a@b.c", "p"),
                ).contains("\"callbackURL\":\"/lifestyle/login\""),
        )
    }

    @Test
    fun signOut() {
        assertTrue(apiJson.decodeFromString<SignOutResponse>(example("auth-sign-out.json")).success)
    }

    @Test
    fun profile() {
        for (name in listOf("profile-get.json", "profile-patch.json", "profile-complete.json")) {
            val profile = apiJson.decodeFromString<ProfileResponse>(example(name)).profile!!
            assertEquals(name, LocalTime.of(7, 0), profile.wakeUpTime)
            assertEquals(name, LocalTime.of(9, 30), profile.workStartTime)
            assertEquals(
                name,
                listOf(DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Friday),
                profile.workDays,
            )
            assertEquals(name, PlanningStyle.Balanced, profile.planningStyle)
        }
    }

    @Test
    fun profileBeforeOnboarding() {
        assertNull(apiJson.decodeFromString<ProfileResponse>(example("profile-get-null.json")).profile)
    }

    @Test
    fun taskPage() {
        val page = apiJson.decodeFromString<TaskPage>(example("tasks-list.json"))
        assertEquals(3, page.tasks.size)
        assertEquals(3, page.total)
        assertTrue(page.tasks.any { it.title == "Review the API contract ✅ — naïve café" })
    }

    @Test
    fun task() {
        for (name in listOf("task-get.json", "task-create.json", "task-patch.json")) {
            val task = apiJson.decodeFromString<TaskResponse>(example(name)).task
            assertEquals(name, "Draft the onboarding copy", task.title)
            assertEquals(name, TaskPriority.High, task.priority)
            assertNotNull(name, task.dueDate)
        }
    }

    @Test
    fun myDay() {
        val day = apiJson.decodeFromString<MyDay>(example("my-day.json"))
        assertEquals(LocalDate.parse("2026-11-17"), day.today)
        assertEquals(day.today, day.selectedDate)
        assertEquals("Asia/Kolkata", day.timeZone)
        assertEquals("Good evening", day.greeting)
        assertEquals("Sam", day.greetingName)
        assertEquals("1 task is due today. Your day is ready for a steady start.", day.briefing)
        assertTrue(day.notices.isEmpty())
        assertEquals(emptyList<TimelineItem>(), day.timeline)
        assertEquals(false, day.timelineTruncated)

        val tasks = day.tasks!!
        assertEquals(1, tasks.summary.dueToday)
        assertEquals(3, tasks.dailySummary.total)
        assertEquals(1, tasks.dailySummary.inProgress)
        assertEquals(listOf(TaskStatus.Todo, TaskStatus.Todo, TaskStatus.InProgress), tasks.dailyTasks.map { it.statusAtSelectedDate })
        assertNull(tasks.dailyTasks[0].completionAtSelectedDate)
        assertNotNull(tasks.dailyTasks[0].activityAtSelectedDate)
        assertEquals(listOf("Draft the onboarding copy"), tasks.sections.today.map { it.task.title })
        assertEquals(2, tasks.sections.backlog.size)
        assertTrue(tasks.sections.overdue.isEmpty())

        val habits = day.habits!!
        assertEquals(1, habits.summary.completedToday)
        val walk = habits.habits.first()
        assertEquals("Evening walk", walk.title)
        assertEquals(HabitFrequency.Daily, walk.frequency)
        assertEquals(HabitStatus.Active, walk.status)
        assertEquals(LocalTime.of(19, 0), walk.startTime)
        assertTrue(walk.completedToday)
        assertEquals(listOf(LocalDate.parse("2026-11-17")), walk.checkIns.map { it.localDate })
    }

    @Test
    fun myDayNoticesAndTimeline() {
        val json =
            """
            {"today":"2026-11-17","selectedDate":"2026-11-16","timeZone":"Asia/Kolkata","greeting":"Good morning",
             "greetingName":"Sam","briefing":null,"tasks":null,"habits":null,"timelineTruncated":true,
             "notices":[{"id":"overdue","tone":"warn","tag":"Overdue tasks","text":"2 tasks are past their due date.",
               "actionLabel":"Decide what to do","prompt":"Help me decide."},
              {"id":"later","tone":"celebrate","tag":"New","text":"A tone this build does not know.","actionLabel":"Open"}],
             "timeline":[{"id":"e1","kind":"focus","label":"Focus session","title":"Write","description":null,
               "startAt":"2026-11-16T04:30:00.000Z","endAt":"2026-11-16T05:20:00.000Z","timeZone":"Asia/Kolkata",
               "taskId":"t1","taskTitle":"Write"},
              {"id":"e2","kind":"travel","label":"Travel","title":"Airport","startAt":"2026-11-16T06:00:00Z",
               "endAt":"2026-11-16T07:00:00Z","timeZone":"Asia/Kolkata"}]}
            """.trimIndent()
        val day = apiJson.decodeFromString<MyDay>(json)
        assertNull(day.tasks)
        assertNull(day.habits)
        assertNull(day.briefing)
        assertEquals(listOf(MyDayNotice.Tone.Warn, MyDayNotice.Tone.Unknown), day.notices.map { it.tone })
        assertEquals("Help me decide.", day.notices[0].prompt)
        assertNull(day.notices[1].prompt)
        assertEquals(listOf(TimelineItem.Kind.Focus, TimelineItem.Kind.Unknown), day.timeline?.map { it.kind })
        assertNull(day.timeline?.get(1)?.taskId)
        assertEquals(true, day.timelineTruncated)
    }

    @Test
    fun habitCheckIns() {
        val first = apiJson.decodeFromString<CheckInResponse>(example("habit-check-in.json"))
        assertFalse(first.alreadyCompleted)
        assertEquals(LocalDate.parse("2026-11-17"), first.checkIn.localDate)
        val repeated = apiJson.decodeFromString<CheckInResponse>(example("habit-check-in-repeat.json"))
        assertTrue(repeated.alreadyCompleted)
        assertEquals(first.checkIn, repeated.checkIn)
        assertTrue(apiJson.decodeFromString<SuccessResponse>(example("habit-check-in-delete.json")).success)
    }

    @Test
    fun taskUpdateSendsOnlyTheStatus() {
        assertEquals("""{"status":"COMPLETED"}""", apiJson.encodeToString(TaskUpdate.serializer(), TaskUpdate(TaskStatus.Completed)))
        assertEquals(
            """{"localDate":"2026-11-17"}""",
            apiJson.encodeToString(CheckInRequest.serializer(), CheckInRequest(LocalDate.parse("2026-11-17"))),
        )
    }

    @Test
    fun unknownEnumValueDecodesToUnknown() {
        assertEquals(TaskStatus.Unknown, apiJson.decodeFromString<Task>(task(status = "\"ARCHIVED\"")).status)
    }

    @Test
    fun missingOptionalFieldDecodesToNull() {
        val json =
            """{"id":"t1","title":"Call the bank","status":"TODO","priority":"LOW",
               "createdAt":"2026-11-17T14:59:47.113Z","updatedAt":"2026-11-17T14:59:47Z"}"""
        val task = apiJson.decodeFromString<Task>(json)
        assertNull(task.description)
        assertNull(task.dueDate)
        assertNull(task.estimatedDurationMinutes)
    }

    @Test
    fun extraFieldIsIgnored() {
        val json = task(status = "\"COMPLETED\"", extra = ""","labels":["new"],"nested":{"a":1}""")
        assertEquals(TaskStatus.Completed, apiJson.decodeFromString<Task>(json).status)
    }

    @Test
    fun instantsAcceptOffsetsAndWholeSeconds() {
        val instants =
            apiJson.decodeFromString(
                ListSerializer(InstantSerializer),
                """["2026-11-17T14:59:44.808Z","2026-11-17T14:59:44Z","2026-11-17T20:29:44.808+05:30"]""",
            )
        assertEquals(instants[0], instants[2])
        assertEquals(Instant.parse("2026-11-17T14:59:44Z"), instants[1])
    }

    @Test
    fun localDatesAndTimesAreStrict() {
        assertEquals(LocalDate.of(2026, 11, 17), apiJson.decodeFromString(LocalDateSerializer, "\"2026-11-17\""))
        for (text in listOf("2026-13-01", "2026-1-01", "20261117", "2026-11-17T00:00:00Z", "")) {
            assertThrows(text, DateTimeParseException::class.java) { apiJson.decodeFromString(LocalDateSerializer, "\"$text\"") }
        }
        for (text in listOf("24:00", "7:00")) {
            assertThrows(text, DateTimeParseException::class.java) { apiJson.decodeFromString(LocalTimeSerializer, "\"$text\"") }
        }
    }

    @Test
    fun missingRequiredFieldFails() {
        assertThrows(SerializationException::class.java) { apiJson.decodeFromString<Task>("""{"id":"t1"}""") }
    }

    private fun task(
        status: String,
        extra: String = "",
    ) = """{"id":"t1","userId":"u1","title":"Call the bank","description":null,"status":$status,"priority":"HIGH",
           "estimatedDurationMinutes":null,"remainingDurationMinutes":null,"dueDate":"2026-11-18","completedAt":null,
           "createdAt":"2026-11-17T14:59:47.113Z","updatedAt":"2026-11-17T14:59:47.113Z"$extra}"""
}
