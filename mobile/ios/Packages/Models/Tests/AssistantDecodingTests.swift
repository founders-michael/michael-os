import Foundation
import TestSupport
import Testing

@testable import Models

struct AssistantDecodingTests {
    private let decoder = JSONDecoder.api()

    private func decode<T: Decodable>(_ type: T.Type, example name: String) throws -> T {
        try decoder.decode(type, from: try ContractExamples.example(name))
    }

    private func json(_ value: some Encodable) throws -> String {
        let encoder = JSONEncoder.api()
        encoder.outputFormatting = .sortedKeys
        return String(bytes: try encoder.encode(value), encoding: .utf8) ?? ""
    }

    @Test func conversations() throws {
        let created = try decode(ConversationResponse.self, example: "conversation-create.json").conversation
        #expect(created.title == "New conversation" && created.messageCount == 0 && created.lastMessageAt == nil)
        let page = try decode(ConversationPage.self, example: "conversations-list.json")
        #expect(page.conversations.first?.title == "What should I do first today?")
        #expect(page.page == 1 && page.pages == 1 && page.total == 1)
        #expect(try decode(ConversationResponse.self, example: "conversation-rename.json").conversation.title == "Renamed from the phone")
        #expect(try decode(ConversationResponse.self, example: "conversation-archive.json").conversation.archivedAt != nil)
        #expect(try decode(ConversationDeleted.self, example: "conversation-delete.json").deleted)
    }

    @Test func messagesComeOldestFirstWithTheirTools() throws {
        let messages = try decode(ConversationMessages.self, example: "conversation-messages.json")
        #expect(messages.messages.map(\.role) == [.user, .assistant, .user, .assistant])
        #expect(messages.messages[1].toolActivity == [ToolActivity(name: "get_daily_overview", status: .completed)])
        #expect(messages.pages == 1)
    }

    @Test func aReplyCarriesItsDraftWithTheValuesMichaelFilled() throws {
        let data = try ContractExamples.example("ai-chat-stream-draft.sse")
        let line = try #require(String(bytes: data, encoding: .utf8)?.split(separator: "\n").first { $0.contains(#""type":"message""#) })
        let event = try ChatEvent.decode(Data(line.dropFirst("data: ".count).utf8), using: decoder)
        guard case .message(let reply) = event else {
            Issue.record("The last frame is the reply")
            return
        }
        #expect(reply.planningProposal == nil)
        let draft = try #require(reply.drafts.first)
        #expect(draft.kind == .task)
        #expect(draft.values == ["priority": .text("HIGH"), "title": .text("Call the bank")])
        #expect(draft.timeZone == "Asia/Kolkata")
    }

    @Test func draftValuesOfAnUnknownShapeAreLeftEmpty() throws {
        let body = """
            {"payloadKind":"record-draft","kind":"habit","values":{"title":"Walk","weekdays":[1,3],"progress":12,"odd":{"x":1}},\
            "missing":[],"ready":true,"endpoint":"/api/habits","timeZone":"UTC"}
            """
        let draft = try decoder.decode(RecordDraft.self, from: Data(body.utf8))
        #expect(draft.values == ["title": .text("Walk"), "weekdays": .days([1, 3]), "progress": .number(12)])
        let unknown = try decoder.decode(
            RecordDraft.self, from: Data(body.replacingOccurrences(of: #""habit""#, with: #""organizationMemory""#).utf8))
        #expect(unknown.kind == .unknown)
    }

    @Test func recordsSavedFromDrafts() throws {
        let goal = try decode(GoalResponse.self, example: "goal-create.json").goal
        #expect(goal.title == "Run a 10k" && goal.targetDate == LocalDate("2027-03-01") && goal.status == .active)
        let habit = try decode(HabitResponse.self, example: "habit-create.json").habit
        #expect(!habit.title.isEmpty)
        let event = try decode(CalendarEventResponse.self, example: "calendar-event-create.json").event
        #expect(event.eventType == .commitment && event.schedulingMode == .fixed && event.timeZone == "Pacific/Auckland")
        #expect(event.endAt.timeIntervalSince(event.startAt) == 1800)
        let memory = try decode(MemoryResponse.self, example: "memory-create.json").memory
        #expect(memory.sensitivity == .standard && memory.keepUntil == nil)
    }

    @Test func requestBodiesCarryOnlyWhatTheSchemasAccept() throws {
        #expect(
            try json(ChatRequest(message: "Hi", conversationId: "c1", dataUseAcknowledged: false))
                == #"{"conversationId":"c1","dataUseAcknowledged":false,"message":"Hi","product":"lifestyle","stream":true}"#
        )
        #expect(try json(ConversationCreate()) == #"{"product":"lifestyle"}"#)
        #expect(try json(ConversationUpdate.rename("Plan")) == #"{"title":"Plan"}"#)
        #expect(try json(ConversationUpdate.archive(true)) == #"{"archived":true}"#)
        #expect(
            try json(DraftOutcome(kind: .discarded, subject: .calendarEvent)) == #"{"kind":"DRAFT_DISCARDED","subject":"calendarEvent"}"#)
        #expect(
            try json(
                TaskCreate(
                    title: "Call", description: nil, priority: .high, dueDate: LocalDate("2026-11-24"), estimatedDurationMinutes: nil))
                == #"{"dueDate":"2026-11-24","priority":"HIGH","title":"Call"}"#
        )
        #expect(
            try json(
                HabitCreate(title: "Walk", description: nil, frequency: .daily, weekdays: [], startTime: LocalTime("07:00"), endTime: nil))
                == #"{"frequency":"DAILY","startTime":"07:00","title":"Walk","weekdays":[]}"#
        )
        #expect(
            try json(MemoryCreate(content: "x", sensitivity: .personal, keepUntil: nil)) == #"{"content":"x","sensitivity":"PERSONAL"}"#)
    }
}
