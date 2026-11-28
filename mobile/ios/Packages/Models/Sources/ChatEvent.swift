import Foundation

/// One event from `POST /api/ai/chat` with `stream: true`. The server sends progress and then the whole reply
/// once; it never streams tokens.
public enum ChatEvent: Equatable, Sendable {
    case accepted
    case toolStart(name: String)
    case toolEnd(name: String, status: ToolStatus)
    case composing
    case ping
    case message(ChatReply)
    case error(ChatStreamError)

    /// Returns nil for an event type this build does not know, so the server can add types without breaking
    /// shipped apps. Throws when a known type's fields do not match.
    public static func decode(_ data: Data, using decoder: JSONDecoder) throws -> ChatEvent? {
        switch try decoder.decode(Frame.self, from: data).type {
        case "accepted": return .accepted
        case "tool-start": return .toolStart(name: try decoder.decode(Tool.self, from: data).name)
        case "tool-end":
            let tool = try decoder.decode(Tool.self, from: data)
            return .toolEnd(name: tool.name, status: tool.status ?? .unknown)
        case "composing": return .composing
        case "ping": return .ping
        case "message": return .message(try decoder.decode(ChatReply.self, from: data))
        case "error": return .error(try decoder.decode(ChatStreamError.self, from: data))
        default: return nil
        }
    }

    private struct Frame: Decodable {
        let type: String
    }

    private struct Tool: Decodable {
        let name: String
        let status: ToolStatus?
    }
}

public struct ChatReply: Decodable, Equatable, Sendable {
    public let content: String
    public let toolActivity: [ToolActivity]
    public let usedSavedData: Bool
    public let drafts: [RecordDraft]
    public let planningProposal: PlanningProposal?

    public init(
        content: String,
        toolActivity: [ToolActivity],
        usedSavedData: Bool,
        drafts: [RecordDraft] = [],
        planningProposal: PlanningProposal? = nil
    ) {
        self.content = content
        self.toolActivity = toolActivity
        self.usedSavedData = usedSavedData
        self.drafts = drafts
        self.planningProposal = planningProposal
    }

    private enum CodingKeys: String, CodingKey {
        case content, toolActivity, usedSavedData, drafts, planningProposal
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        content = try container.decode(String.self, forKey: .content)
        toolActivity = try container.decode([ToolActivity].self, forKey: .toolActivity)
        usedSavedData = try container.decode(Bool.self, forKey: .usedSavedData)
        drafts = try container.decodeIfPresent([RecordDraft].self, forKey: .drafts) ?? []
        // A proposal this build cannot read drops the card, not the reply.
        planningProposal = try? container.decodeIfPresent(PlanningProposal.self, forKey: .planningProposal)
    }
}

public struct ToolActivity: Decodable, Equatable, Sendable {
    public let name: String
    public let status: ToolStatus

    public init(name: String, status: ToolStatus) {
        self.name = name
        self.status = status
    }
}

public enum ToolStatus: String, OpenEnum {
    case completed
    case unavailable
    case failed
    case unknown
}

public struct ChatStreamError: Decodable, Equatable, Sendable {
    public let code: String
    public let message: String
    public let retryAfterSeconds: Int?

    public init(code: String, message: String, retryAfterSeconds: Int? = nil) {
        self.code = code
        self.message = message
        self.retryAfterSeconds = retryAfterSeconds
    }
}
