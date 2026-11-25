import Foundation
import Models

/// What the chat shows. A turn in flight, a failure and a pending acknowledgement each hold the user's message,
/// which is not part of the transcript until the server has saved the exchange.
public struct ChatContent: Equatable {
    var conversation: Conversation?
    var entries: [ChatEntry] = []
    /// The page of older messages still to load, oldest first; nil when everything is shown.
    var earlierPage: Int?
    var loadingEarlier = false
    var turn: Turn?
    var failure: ChatFailure?
    /// The server asked for the data-use acknowledgement before sending this message.
    var acknowledgement: String?
    var revealing: ChatEntry.ID?

    var isEmpty: Bool { entries.isEmpty && turn == nil && failure == nil && acknowledgement == nil }

    var pendingDrafts: Int {
        entries.reduce(0) { count, entry in
            guard case .michael(let reply) = entry.body else { return count }
            return count + reply.drafts.filter { $0.status == .editing || $0.status == .saving }.count
        }
    }
}

struct Turn: Equatable {
    let message: String
    var progress: TurnProgress
}

public struct ChatEntry: Equatable, Identifiable {
    enum Body: Equatable {
        case user(String)
        case michael(MichaelReply)
    }

    public let id: String
    var body: Body
}

struct MichaelReply: Equatable {
    let lines: [ReplyLine]
    let toolActivity: [ToolActivity]
    let usedSavedData: Bool
    var drafts: [DraftCard]
    /// A schedule draft arrived with the reply. Phase 8 builds the card that applies it.
    let hasPlanningProposal: Bool

    var plainText: String { ReplyFormat.plain(lines) }
}

struct DraftCard: Equatable, Identifiable {
    enum Status: Equatable {
        case editing, saving, saved, discarded
    }

    let id: String
    var form: DraftForm
    var status = Status.editing
    /// Why the last save was refused, beside the card.
    var error: String?
    /// The server's reasons by form field, from a 400 with `fields`.
    var fieldErrors: [String: String] = [:]
}

/// Why a message could not be answered, and the one thing the user can do about it.
struct ChatFailure: Equatable {
    enum Action: Equatable {
        case retry
        case retryAfter(Date)
        /// The server may have finished the turn after the stream was closed, so Try again reads the conversation
        /// first and sends only if the reply is not there.
        case reloadThenRetry
        /// The message is put back in the composer to shorten or change.
        case edit
        case newChat
        case finishSetup
        case openHistory
        case none
    }

    let message: String
    let reason: String
    let action: Action
}
