import Foundation
import Models
import Observation
import Repositories

/// The conversation history sheet. Rename, archive and delete wait for the server: it names the conversation
/// and owns whether the change is allowed.
@MainActor
@Observable
public final class HistoryModel {
    public enum State: Equatable {
        case loading
        case content(HistoryContent)
        case empty
        case failed(AppError)
    }

    public struct HistoryContent: Equatable {
        var conversations: [Conversation]
        var nextPage: Int?
        var loadingMore = false
        /// Conversations with a change in flight; their rows are disabled.
        var pending: Set<Conversation.ID> = []
        /// Why the last change was refused, above the list.
        var error: String?
    }

    public private(set) var state: State = .loading
    public private(set) var filter = ConversationFilter.active
    private let assistant: any AssistantRepository
    private var generation = 0

    public init(assistant: any AssistantRepository) {
        self.assistant = assistant
    }

    public func load() async {
        generation += 1
        let current = generation
        state = .loading
        do {
            let page = try await assistant.conversations(filter, page: 1)
            guard current == generation else { return }
            state =
                page.conversations.isEmpty
                ? .empty : .content(HistoryContent(conversations: page.conversations, nextPage: Self.next(page)))
        } catch is CancellationError {
            return
        } catch {
            guard current == generation else { return }
            state = .failed(error as? AppError ?? .server(ServerMessage()))
        }
    }

    public func show(_ filter: ConversationFilter) async {
        guard filter != self.filter else { return }
        self.filter = filter
        await load()
    }

    public func loadMore() async {
        guard case .content(var content) = state, let page = content.nextPage, !content.loadingMore else { return }
        let current = generation
        content.loadingMore = true
        state = .content(content)
        let more = try? await assistant.conversations(filter, page: page)
        guard current == generation, case .content(var latest) = state else { return }
        latest.loadingMore = false
        if let more {
            let known = Set(latest.conversations.map(\.id))
            latest.conversations += more.conversations.filter { !known.contains($0.id) }
            latest.nextPage = Self.next(more)
        }
        state = .content(latest)
    }

    /// Returns the conversation as the server saved it.
    public func rename(_ id: Conversation.ID, to title: String) async -> Conversation? {
        let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return nil }
        guard let renamed = await change(id, { try await $0.updateConversation(id, .rename(String(title.prefix(120)))) })
        else { return nil }
        edit { content in
            if let index = content.conversations.firstIndex(where: { $0.id == id }) { content.conversations[index] = renamed }
        }
        return renamed
    }

    /// Archiving moves a conversation out of the list shown; unarchiving brings it back to the active one.
    public func setArchived(_ id: Conversation.ID, _ archived: Bool) async -> Bool {
        guard await change(id, { try await $0.updateConversation(id, .archive(archived)) }) != nil else { return false }
        remove(id)
        return true
    }

    public func delete(_ id: Conversation.ID) async -> Bool {
        let deleted = await change(id) { repository -> Bool in
            try await repository.deleteConversation(id)
            return true
        }
        guard deleted == true else { return false }
        remove(id)
        return true
    }

    private func change<Result>(
        _ id: Conversation.ID,
        _ call: (any AssistantRepository) async throws -> Result
    ) async -> Result? {
        guard case .content(let content) = state, !content.pending.contains(id) else { return nil }
        edit {
            $0.pending.insert(id)
            $0.error = nil
        }
        do {
            let result = try await call(assistant)
            edit { $0.pending.remove(id) }
            return result
        } catch {
            let appError = error as? AppError ?? .server(ServerMessage())
            edit {
                $0.pending.remove(id)
                $0.error = Self.refusal(appError)
            }
            return nil
        }
    }

    private func remove(_ id: Conversation.ID) {
        edit { $0.conversations.removeAll { $0.id == id } }
        if case .content(let content) = state, content.conversations.isEmpty, content.nextPage == nil { state = .empty }
    }

    private func edit(_ change: (inout HistoryContent) -> Void) {
        guard case .content(var content) = state else { return }
        change(&content)
        state = .content(content)
    }

    private static func next(_ page: ConversationPage) -> Int? {
        page.page < page.pages ? page.page + 1 : nil
    }

    private static func refusal(_ error: AppError) -> String {
        switch error {
        case .offline: String(localized: "history.error.offline", bundle: .module)
        case .notFound, .conflict, .validation, .forbidden, .rateLimited:
            error.serverText ?? String(localized: "history.error.generic", bundle: .module)
        case .timeout, .unauthorized, .server, .decoding: String(localized: "history.error.generic", bundle: .module)
        }
    }
}

extension AppError {
    var serverText: String? {
        switch self {
        case .unauthorized(let server), .forbidden(let server), .notFound(let server), .conflict(let server),
            .validation(let server, _), .rateLimited(let server, _), .server(let server):
            server.text
        case .offline, .timeout, .decoding: nil
        }
    }
}
