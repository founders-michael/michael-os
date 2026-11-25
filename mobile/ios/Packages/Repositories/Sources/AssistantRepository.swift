import Foundation
import Models
import Networking

/// Every call throws `AppError` or `CancellationError`.
public protocol AssistantRepository: Sendable {
    func conversations(_ filter: ConversationFilter, page: Int) async throws -> ConversationPage
    func createConversation() async throws -> Conversation
    func updateConversation(_ id: Conversation.ID, _ change: ConversationUpdate) async throws -> Conversation
    func deleteConversation(_ id: Conversation.ID) async throws
    /// A page of `messagePageSize` messages, oldest first.
    func messages(_ id: Conversation.ID, page: Int) async throws -> ConversationMessages
    /// Sends one message and hands each stream event to `onEvent` until the server closes the stream. The server
    /// saves the exchange only when the turn completes.
    func send(_ request: ChatRequest, onEvent: (ChatEvent) -> Void) async throws
    func record(_ outcome: DraftOutcome) async throws
}

/// The most the server returns in one page of messages.
public let messagePageSize = 100

public struct RemoteAssistantRepository: AssistantRepository {
    private let client: APIClient
    private static let conversationPageSize = 20

    public init(client: APIClient) {
        self.client = client
    }

    public func conversations(_ filter: ConversationFilter, page: Int) async throws -> ConversationPage {
        let query = [
            URLQueryItem(name: "product", value: "lifestyle"),
            URLQueryItem(name: "include", value: filter.rawValue),
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "limit", value: String(Self.conversationPageSize)),
        ]
        return try await client.send(APIRequest<ConversationPage>.get("/api/ai/conversations", query: query)).value
    }

    public func createConversation() async throws -> Conversation {
        let request = try APIRequest<ConversationResponse>.post("/api/ai/conversations", body: ConversationCreate())
        return try await client.send(request).value.conversation
    }

    public func updateConversation(_ id: Conversation.ID, _ change: ConversationUpdate) async throws -> Conversation {
        let request = try APIRequest<ConversationResponse>.patch("/api/ai/conversations/\(id)", body: change)
        return try await client.send(request).value.conversation
    }

    public func deleteConversation(_ id: Conversation.ID) async throws {
        _ = try await client.send(APIRequest<ConversationDeleted>.delete("/api/ai/conversations/\(id)"))
    }

    public func messages(_ id: Conversation.ID, page: Int) async throws -> ConversationMessages {
        let query = [
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "limit", value: String(messagePageSize)),
        ]
        return try await client.send(APIRequest<ConversationMessages>.get("/api/ai/conversations/\(id)/messages", query: query)).value
    }

    public func send(_ request: ChatRequest, onEvent: (ChatEvent) -> Void) async throws {
        try await client.stream("/api/ai/chat", body: request, onEvent: onEvent)
    }

    public func record(_ outcome: DraftOutcome) async throws {
        _ = try await client.send(APIRequest<OutcomeRecorded>.post("/api/feedback/outcomes", body: outcome))
    }

    private struct OutcomeRecorded: Decodable, Sendable {}
}
