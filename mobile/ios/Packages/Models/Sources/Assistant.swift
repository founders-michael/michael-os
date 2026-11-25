import Foundation

public struct Conversation: Decodable, Equatable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var messageCount: Int
    public var lastMessageAt: Date?
    public var archivedAt: Date?
    public var createdAt: Date

    public init(id: String, title: String, messageCount: Int, lastMessageAt: Date?, archivedAt: Date?, createdAt: Date) {
        self.id = id
        self.title = title
        self.messageCount = messageCount
        self.lastMessageAt = lastMessageAt
        self.archivedAt = archivedAt
        self.createdAt = createdAt
    }
}

public struct ConversationResponse: Decodable, Equatable, Sendable {
    public let conversation: Conversation
}

public struct ConversationPage: Decodable, Equatable, Sendable {
    public let conversations: [Conversation]
    public let page: Int
    public let pages: Int
    public let total: Int

    public init(conversations: [Conversation], page: Int, pages: Int, total: Int) {
        self.conversations = conversations
        self.page = page
        self.pages = pages
        self.total = total
    }
}

public enum ConversationFilter: String, Sendable {
    case active = "ACTIVE"
    case archived = "ARCHIVED"
}

public enum MessageRole: String, OpenEnum {
    case user
    case assistant
    case unknown
}

public struct ConversationMessage: Decodable, Equatable, Sendable, Identifiable {
    public let id: String
    public let role: MessageRole
    public let content: String
    public let toolActivity: [ToolActivity]
    public let createdAt: Date

    public init(id: String, role: MessageRole, content: String, toolActivity: [ToolActivity], createdAt: Date) {
        self.id = id
        self.role = role
        self.content = content
        self.toolActivity = toolActivity
        self.createdAt = createdAt
    }
}

/// Messages come oldest first, a page at a time.
public struct ConversationMessages: Decodable, Equatable, Sendable {
    public let conversation: Conversation
    public let messages: [ConversationMessage]
    public let page: Int
    public let pages: Int

    public init(conversation: Conversation, messages: [ConversationMessage], page: Int, pages: Int) {
        self.conversation = conversation
        self.messages = messages
        self.page = page
        self.pages = pages
    }
}

/// `POST /api/ai/conversations`. No title: the server names the conversation after its first message.
public struct ConversationCreate: Encodable, Sendable {
    public let product = "lifestyle"

    public init() {}
}

/// `PATCH /api/ai/conversations/{id}`, one change at a time. The server refuses unknown fields.
public enum ConversationUpdate: Encodable, Equatable, Sendable {
    case rename(String)
    case archive(Bool)

    private enum CodingKeys: String, CodingKey {
        case title, archived
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .rename(let title): try container.encode(title, forKey: .title)
        case .archive(let archived): try container.encode(archived, forKey: .archived)
        }
    }
}

public struct ConversationDeleted: Decodable, Sendable {
    public let deleted: Bool
}

/// `POST /api/ai/chat`. A stored conversation's history is loaded by the server, so none is sent.
public struct ChatRequest: Encodable, Equatable, Sendable {
    public let product = "lifestyle"
    public let message: String
    public let conversationId: String
    public let dataUseAcknowledged: Bool
    public let stream = true

    public init(message: String, conversationId: String, dataUseAcknowledged: Bool) {
        self.message = message
        self.conversationId = conversationId
        self.dataUseAcknowledged = dataUseAcknowledged
    }

    private enum CodingKeys: String, CodingKey {
        case product, message, conversationId, dataUseAcknowledged, stream
    }
}

/// `POST /api/feedback/outcomes`: what the user did with a draft. It carries the draft's kind, never its fields.
public struct DraftOutcome: Encodable, Equatable, Sendable {
    public enum Kind: String, Encodable, Sendable {
        case saved = "DRAFT_SAVED"
        case discarded = "DRAFT_DISCARDED"
    }

    public let kind: Kind
    public let subject: DraftKind

    public init(kind: Kind, subject: DraftKind) {
        self.kind = kind
        self.subject = subject
    }
}
