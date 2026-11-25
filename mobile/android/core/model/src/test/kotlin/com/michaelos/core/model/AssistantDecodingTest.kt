package com.michaelos.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.time.Duration
import java.time.LocalDate
import java.time.LocalTime

class AssistantDecodingTest {
    private fun example(name: String) = File(checkNotNull(System.getProperty("contract.path")), "examples/$name").readText()

    @Test
    fun conversations() {
        val created = apiJson.decodeFromString<ConversationResponse>(example("conversation-create.json")).conversation
        assertEquals("New conversation", created.title)
        assertEquals(0, created.messageCount)
        assertNull(created.lastMessageAt)
        val page = apiJson.decodeFromString<ConversationPage>(example("conversations-list.json"))
        assertEquals("What should I do first today?", page.conversations.first().title)
        assertEquals(listOf(1, 1, 1), listOf(page.page, page.pages, page.total))
        assertEquals(
            "Renamed from the phone",
            apiJson.decodeFromString<ConversationResponse>(example("conversation-rename.json")).conversation.title,
        )
        assertNotNull(apiJson.decodeFromString<ConversationResponse>(example("conversation-archive.json")).conversation.archivedAt)
        assertTrue(apiJson.decodeFromString<ConversationDeleted>(example("conversation-delete.json")).deleted)
        assertTrue(apiJson.decodeFromString<OutcomeRecorded>(example("feedback-outcome.json")).recorded)
    }

    @Test
    fun messagesComeOldestFirstWithTheirTools() {
        val messages = apiJson.decodeFromString<ConversationMessages>(example("conversation-messages.json"))
        assertEquals(
            listOf(MessageRole.User, MessageRole.Assistant, MessageRole.User, MessageRole.Assistant),
            messages.messages.map { it.role },
        )
        assertEquals(listOf(ToolActivity("get_daily_overview", ToolStatus.Completed)), messages.messages[1].toolActivity)
        assertEquals(1, messages.pages)
    }

    @Test
    fun aReplyCarriesItsDraftWithTheValuesMichaelFilled() {
        val line = example("ai-chat-stream-draft.sse").lines().first { it.contains("\"type\":\"message\"") }
        val event = ChatEvent.decode(line.removePrefix("data: ")) as ChatEvent.Message
        assertNull(event.reply.planningProposal)
        val draft = event.reply.drafts.single()
        assertEquals(DraftKind.Task, draft.kind)
        assertEquals(mapOf("priority" to DraftValue.Text("HIGH"), "title" to DraftValue.Text("Call the bank")), draft.values)
        assertEquals("Asia/Kolkata", draft.timeZone)
    }

    @Test
    fun draftValuesOfAnUnknownShapeAreLeftEmpty() {
        val body =
            """{"payloadKind":"record-draft","kind":"habit","values":{"title":"Walk","weekdays":[1,3],"progress":12,"odd":{"x":1}},""" +
                """"missing":[],"ready":true,"endpoint":"/api/habits","timeZone":"UTC"}"""
        val draft = apiJson.decodeFromString<RecordDraft>(body)
        assertEquals(
            mapOf(
                "title" to DraftValue.Text("Walk"),
                "weekdays" to DraftValue.Days(listOf(1, 3)),
                "progress" to DraftValue.Number(12),
            ),
            draft.values,
        )
        assertEquals(DraftKind.Unknown, apiJson.decodeFromString<RecordDraft>(body.replace("\"habit\"", "\"organizationMemory\"")).kind)
    }

    @Test
    fun recordsSavedFromDrafts() {
        val goal = apiJson.decodeFromString<GoalResponse>(example("goal-create.json")).goal
        assertEquals("Run a 10k", goal.title)
        assertEquals(LocalDate.parse("2027-03-01"), goal.targetDate)
        assertEquals(GoalStatus.Active, goal.status)
        assertTrue(
            apiJson
                .decodeFromString<HabitResponse>(example("habit-create.json"))
                .habit.title
                .isNotEmpty(),
        )
        val event = apiJson.decodeFromString<CalendarEventResponse>(example("calendar-event-create.json")).event
        assertEquals(CalendarEventType.Commitment, event.eventType)
        assertEquals(SchedulingMode.Fixed, event.schedulingMode)
        assertEquals(Duration.ofMinutes(30), Duration.between(event.startAt, event.endAt))
        val memory = apiJson.decodeFromString<MemoryResponse>(example("memory-create.json")).memory
        assertEquals(MemorySensitivity.Standard, memory.sensitivity)
        assertNull(memory.keepUntil)
    }

    @Test
    fun requestBodiesCarryOnlyWhatTheSchemasAccept() {
        assertEquals(
            """{"message":"Hi","conversationId":"c1","dataUseAcknowledged":false,"product":"lifestyle","stream":true}""",
            apiJson.encodeToString(ChatRequest("Hi", "c1", dataUseAcknowledged = false)),
        )
        assertEquals("""{"product":"lifestyle"}""", apiJson.encodeToString(ConversationCreate()))
        assertEquals("""{"title":"Plan"}""", apiJson.encodeToString<ConversationUpdate>(ConversationUpdate.Rename("Plan")))
        assertEquals("""{"archived":true}""", apiJson.encodeToString<ConversationUpdate>(ConversationUpdate.Archive(true)))
        assertEquals(
            """{"kind":"DRAFT_DISCARDED","subject":"calendarEvent"}""",
            apiJson.encodeToString(DraftOutcome(DraftOutcome.Kind.Discarded, DraftKind.CalendarEvent)),
        )
        assertEquals(
            """{"title":"Call","priority":"HIGH","dueDate":"2026-11-24"}""",
            apiJson.encodeToString(TaskCreate("Call", TaskPriority.High, dueDate = LocalDate.parse("2026-11-24"))),
        )
        assertEquals(
            """{"title":"Walk","frequency":"DAILY","weekdays":[],"startTime":"07:00"}""",
            apiJson.encodeToString(HabitCreate("Walk", HabitFrequency.Daily, emptyList(), startTime = LocalTime.of(7, 0))),
        )
        assertEquals("""{"content":"x","sensitivity":"PERSONAL"}""", apiJson.encodeToString(MemoryCreate("x", MemorySensitivity.Personal)))
    }
}
