import Foundation
import Models
import Repositories
import os

/// Holds conversations and their messages, and plays a scripted stream for each message sent.
public final class FakeAssistantRepository: AssistantRepository {
    /// One step of a scripted reply. `wait` pauses the stream until the test lets it go on.
    public enum Step: Sendable {
        case event(ChatEvent)
        case wait(@Sendable () async -> Void)
        case refuse(AppError)
    }

    public enum Call: Equatable, Sendable {
        case list(ConversationFilter, page: Int)
        case create
        case update(Conversation.ID, ConversationUpdate)
        case delete(Conversation.ID)
        case messages(Conversation.ID, page: Int)
        case send(ChatRequest)
        case outcome(DraftOutcome)
    }

    private struct State {
        var conversations: [Conversation] = []
        var messages: [Conversation.ID: [ConversationMessage]] = [:]
        var scripts: [[Step]] = []
        var failures: [AppError] = []
        var calls: [Call] = []
        var created = 0

        mutating func throwFailure() throws {
            if !failures.isEmpty { throw failures.removeFirst() }
        }
    }

    private let lock = OSAllocatedUnfairLock(initialState: State())
    private static let listPageSize = 20

    public init(conversations: [Conversation] = [], messages: [Conversation.ID: [ConversationMessage]] = [:]) {
        lock.withLock {
            $0.conversations = conversations
            $0.messages = messages
        }
    }

    public var calls: [Call] { lock.withLock { $0.calls } }

    public var sent: [ChatRequest] {
        calls.compactMap { if case .send(let request) = $0 { request } else { nil } }
    }

    /// The next message sent plays these steps; with no script left, a send ends the stream with no reply.
    public func script(_ steps: Step...) { lock.withLock { $0.scripts.append(steps) } }

    /// The next calls other than `send` fail with these, in order.
    public func fail(with errors: AppError...) { lock.withLock { $0.failures = errors } }

    /// Stores an exchange, as the server does when a turn completes.
    public func save(_ id: Conversation.ID, user: String, reply: String) {
        lock.withLock { state in
            var messages = state.messages[id] ?? []
            messages.append(ConversationMessage(id: "m\(messages.count)", role: .user, content: user, toolActivity: [], createdAt: .now))
            messages.append(
                ConversationMessage(id: "m\(messages.count)", role: .assistant, content: reply, toolActivity: [], createdAt: .now)
            )
            state.messages[id] = messages
            if let index = state.conversations.firstIndex(where: { $0.id == id }) {
                state.conversations[index].messageCount = messages.count
                if state.conversations[index].title == "New conversation" { state.conversations[index].title = user }
            }
        }
    }

    public func conversations(_ filter: ConversationFilter, page: Int) async throws -> ConversationPage {
        try lock.withLock { state in
            state.calls.append(.list(filter, page: page))
            try state.throwFailure()
            let matching = state.conversations.filter { ($0.archivedAt != nil) == (filter == .archived) }
            let pages = max(1, (matching.count + Self.listPageSize - 1) / Self.listPageSize)
            let slice = matching.dropFirst((page - 1) * Self.listPageSize).prefix(Self.listPageSize)
            return ConversationPage(conversations: Array(slice), page: page, pages: pages, total: matching.count)
        }
    }

    public func createConversation() async throws -> Conversation {
        try lock.withLock { state in
            state.calls.append(.create)
            try state.throwFailure()
            state.created += 1
            let conversation = Conversation(
                id: "new-\(state.created)",
                title: "New conversation",
                messageCount: 0,
                lastMessageAt: nil,
                archivedAt: nil,
                createdAt: .now
            )
            state.conversations.insert(conversation, at: 0)
            return conversation
        }
    }

    public func updateConversation(_ id: Conversation.ID, _ change: ConversationUpdate) async throws -> Conversation {
        try lock.withLock { state in
            state.calls.append(.update(id, change))
            try state.throwFailure()
            guard let index = state.conversations.firstIndex(where: { $0.id == id }) else {
                throw AppError.notFound(ServerMessage(text: "Conversation not found.", code: "CONVERSATION_NOT_FOUND"))
            }
            switch change {
            case .rename(let title): state.conversations[index].title = title
            case .archive(let archived): state.conversations[index].archivedAt = archived ? .now : nil
            }
            return state.conversations[index]
        }
    }

    public func deleteConversation(_ id: Conversation.ID) async throws {
        try lock.withLock { state in
            state.calls.append(.delete(id))
            try state.throwFailure()
            state.conversations.removeAll { $0.id == id }
            state.messages[id] = nil
        }
    }

    public func messages(_ id: Conversation.ID, page: Int) async throws -> ConversationMessages {
        try lock.withLock { state in
            state.calls.append(.messages(id, page: page))
            try state.throwFailure()
            guard let conversation = state.conversations.first(where: { $0.id == id }) else {
                throw AppError.notFound(ServerMessage(text: "Conversation not found.", code: "CONVERSATION_NOT_FOUND"))
            }
            let all = state.messages[id] ?? []
            let pages = max(1, (all.count + messagePageSize - 1) / messagePageSize)
            let slice = all.dropFirst((page - 1) * messagePageSize).prefix(messagePageSize)
            return ConversationMessages(conversation: conversation, messages: Array(slice), page: page, pages: pages)
        }
    }

    public func send(_ request: ChatRequest, onEvent: (ChatEvent) -> Void) async throws {
        let steps = lock.withLock { state in
            state.calls.append(.send(request))
            return state.scripts.isEmpty ? [] : state.scripts.removeFirst()
        }
        for step in steps {
            try _Concurrency.Task.checkCancellation()
            switch step {
            case .event(let event): onEvent(event)
            case .wait(let gate): await gate()
            case .refuse(let error): throw error
            }
        }
        try _Concurrency.Task.checkCancellation()
    }

    public func record(_ outcome: DraftOutcome) async throws {
        lock.withLock { $0.calls.append(.outcome(outcome)) }
    }
}

/// Records each record created from a draft and answers as the server would, unless a failure is queued.
public final class FakeRecordRepository: GoalRepository, CalendarRepository, MemoryRepository {
    public enum Call: Equatable, Sendable {
        case goal(GoalCreate)
        case event(CalendarEventCreate)
        case memory(MemoryCreate)
    }

    private struct State {
        var calls: [Call] = []
        var failures: [AppError] = []
    }

    private let lock = OSAllocatedUnfairLock(initialState: State())

    public init() {}

    public var calls: [Call] { lock.withLock { $0.calls } }

    public func fail(with errors: AppError...) { lock.withLock { $0.failures = errors } }

    /// Answers with the goal in `goal-create.json`, whatever was sent.
    public func create(_ goal: GoalCreate) async throws -> Goal {
        try record(.goal(goal))
        return try JSONDecoder.api().decode(GoalResponse.self, from: try ContractExamples.example("goal-create.json")).goal
    }

    /// Answers with the event in `calendar-event-create.json`, whatever was sent.
    public func create(_ event: CalendarEventCreate) async throws -> CalendarEvent {
        try record(.event(event))
        let example = try ContractExamples.example("calendar-event-create.json")
        return try JSONDecoder.api().decode(CalendarEventResponse.self, from: example).event
    }

    /// Answers with the memory in `memory-create.json`, whatever was sent.
    public func create(_ memory: MemoryCreate) async throws -> Memory {
        try record(.memory(memory))
        return try JSONDecoder.api().decode(MemoryResponse.self, from: try ContractExamples.example("memory-create.json")).memory
    }

    private func record(_ call: Call) throws {
        try lock.withLock { state in
            state.calls.append(call)
            if !state.failures.isEmpty { throw state.failures.removeFirst() }
        }
    }
}
