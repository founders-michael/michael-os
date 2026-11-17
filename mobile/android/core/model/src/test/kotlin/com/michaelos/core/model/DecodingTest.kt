package com.michaelos.core.model

import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.nullable
import org.junit.Assert.assertEquals
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
