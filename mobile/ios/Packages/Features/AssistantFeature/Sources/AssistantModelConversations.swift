import Foundation
import Models
import Repositories

extension AssistantModel {
    /// Opens a stored conversation at its newest messages. `knownCount` comes from the history list and saves a
    /// read; without it the first page says how many pages there are.
    public func open(_ id: Conversation.ID, knownCount: Int?) async {
        guard !isBusy else { return }
        readGeneration += 1
        let generation = readGeneration
        state = .opening
        do {
            let pages: [ConversationMessages] = try await newestPages(id, knownCount: knownCount)
            guard generation == readGeneration, let newest = pages.last else { return }
            let first = pages.first?.page ?? newest.page
            state = .chat(
                ChatContent(
                    conversation: newest.conversation,
                    entries: pages.flatMap(\.messages).compactMap(Self.entry),
                    earlierPage: first > 1 ? first - 1 : nil
                )
            )
        } catch is CancellationError {
            return
        } catch {
            guard generation == readGeneration else { return }
            state = .failed(error as? AppError ?? .server(ServerMessage()), id)
        }
    }

    /// The newest page, and the one before it when the newest holds only a few messages, so a conversation never
    /// opens on a near-empty screen.
    private func newestPages(_ id: Conversation.ID, knownCount: Int?) async throws -> [ConversationMessages] {
        let size = messagePageSize
        let last: ConversationMessages
        if let knownCount {
            last = try await repositories.assistant.messages(id, page: max(1, (knownCount + size - 1) / size))
        } else {
            let first = try await repositories.assistant.messages(id, page: 1)
            last = first.pages > 1 ? try await repositories.assistant.messages(id, page: first.pages) : first
        }
        guard last.page > 1, last.messages.count < size / 2 else { return [last] }
        return [try await repositories.assistant.messages(id, page: last.page - 1), last]
    }

    public func loadEarlier() async {
        guard let content, let page = content.earlierPage, let id = content.conversation?.id, !content.loadingEarlier else { return }
        update { $0.loadingEarlier = true }
        let generation = readGeneration
        let older = try? await repositories.assistant.messages(id, page: page)
        guard generation == readGeneration else { return }
        update {
            $0.loadingEarlier = false
            guard let older else { return }
            $0.entries.insert(contentsOf: older.messages.compactMap(Self.entry), at: 0)
            $0.earlierPage = page > 1 ? page - 1 : nil
        }
    }

    /// The conversation was renamed in the history sheet.
    public func renamed(_ conversation: Conversation) {
        update { if $0.conversation?.id == conversation.id { $0.conversation?.title = conversation.title } }
    }

    /// The conversation was deleted in the history sheet; the open one goes with it.
    public func deleted(_ id: Conversation.ID) {
        if conversationID == id { startNewChat() }
        if case .failed(_, let failedID) = state, failedID == id { startNewChat() }
    }

    /// Replies read from history are shown whole; their drafts were never stored, so none come back.
    private static func entry(_ message: ConversationMessage) -> ChatEntry? {
        switch message.role {
        case .user:
            return ChatEntry(id: message.id, body: .user(message.content))
        case .assistant:
            let reply = MichaelReply(
                lines: ReplyFormat.parse(message.content),
                toolActivity: message.toolActivity,
                usedSavedData: message.toolActivity.contains { $0.status == .completed },
                drafts: [],
                planningProposal: nil
            )
            return ChatEntry(id: message.id, body: .michael(reply))
        case .unknown:
            return nil
        }
    }
}
