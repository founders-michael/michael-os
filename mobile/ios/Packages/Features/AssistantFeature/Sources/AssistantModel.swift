import Foundation
import Models
import Observation
import Repositories

/// The repositories the chat reads and the five a draft can be saved through.
public struct AssistantRepositories: Sendable {
    let assistant: any AssistantRepository
    let tasks: any TaskRepository
    let goals: any GoalRepository
    let habits: any HabitRepository
    let calendar: any CalendarRepository
    let memories: any MemoryRepository

    public init(
        assistant: any AssistantRepository,
        tasks: any TaskRepository,
        goals: any GoalRepository,
        habits: any HabitRepository,
        calendar: any CalendarRepository,
        memories: any MemoryRepository
    ) {
        self.assistant = assistant
        self.tasks = tasks
        self.goals = goals
        self.habits = habits
        self.calendar = calendar
        self.memories = memories
    }
}

@MainActor
@Observable
public final class AssistantModel {
    public enum State: Equatable {
        /// A stored conversation is being read.
        case opening
        case chat(ChatContent)
        /// The conversation could not be read and nothing is shown.
        case failed(AppError, Conversation.ID)
    }

    public internal(set) var state: State = .chat(ChatContent())
    /// What the user is typing. The screen keeps it across relaunch.
    public var composer = ""
    public var composerFocused = false

    static let messageLimit = 4000
    /// How near the limit the count appears.
    static let countFrom = 3600

    let repositories: AssistantRepositories
    let now: () -> Date
    let backgroundGrace: Duration
    /// Asked once per signed-in session, when the server says the AI provider's data terms need it.
    var dataUseAcknowledged = false
    private var turnTask: _Concurrency.Task<Void, Never>?
    private var graceTask: _Concurrency.Task<Void, Never>?
    private var cutByBackground = false
    var readGeneration = 0

    public init(
        repositories: AssistantRepositories,
        now: @escaping () -> Date = Date.init,
        backgroundGrace: Duration = .seconds(10)
    ) {
        self.repositories = repositories
        self.now = now
        self.backgroundGrace = backgroundGrace
    }

    var content: ChatContent? {
        if case .chat(let content) = state { return content }
        return nil
    }

    public var conversationID: Conversation.ID? { content?.conversation?.id }

    var isBusy: Bool { content?.turn != nil }

    var presence: PresenceState {
        PresenceSignals(
            turn: content?.turn?.progress,
            revealing: content?.revealing != nil,
            failed: content?.failure != nil,
            pendingApprovals: content?.pendingDrafts ?? 0,
            userComposing: composerFocused && !composer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        )
        .state
    }

    /// The server counts UTF-16 units, as JavaScript strings do.
    var composerCount: Int { composer.trimmingCharacters(in: .whitespacesAndNewlines).utf16.count }

    /// A suggested prompt can be sent whenever nothing is in flight or waiting for the user.
    var canSendSuggestion: Bool { content.map { $0.turn == nil && $0.acknowledgement == nil } ?? false }

    var canSend: Bool {
        guard let content, content.turn == nil, content.acknowledgement == nil else { return false }
        return composerCount > 0 && composerCount <= Self.messageLimit
    }

    func update(_ change: (inout ChatContent) -> Void) {
        guard case .chat(var content) = state else { return }
        change(&content)
        state = .chat(content)
    }

    public func sendComposer() {
        guard canSend else { return }
        let message = composer.trimmingCharacters(in: .whitespacesAndNewlines)
        composer = ""
        send(message)
    }

    /// Sends a suggested prompt, or a failed message again.
    func send(_ message: String) {
        guard let content, content.turn == nil, !message.isEmpty, message.utf16.count <= Self.messageLimit else { return }
        update {
            $0.failure = nil
            $0.acknowledgement = nil
            $0.turn = Turn(message: message, progress: .sending)
        }
        cutByBackground = false
        // Held by the model, not the view: switching tabs must not cancel a message the user sent.
        turnTask = _Concurrency.Task { await self.runTurn(message) }
    }

    public func retry() {
        guard let failure = content?.failure else { return }
        switch failure.action {
        case .retryAfter(let date) where date > now():
            return
        case .reloadThenRetry:
            guard let id = conversationID else { return send(failure.message) }
            _Concurrency.Task {
                await open(id, knownCount: nil)
                if !replied(to: failure.message) { send(failure.message) }
            }
        default:
            send(failure.message)
        }
    }

    /// The conversation ends with this message and a reply to it, as the server saves a completed exchange.
    func replied(to message: String) -> Bool {
        guard let entries = content?.entries, entries.count >= 2, case .michael = entries[entries.count - 1].body,
            case .user(let asked) = entries[entries.count - 2].body
        else { return false }
        return asked == message
    }

    /// The failed message goes back to the composer to be changed.
    public func editFailed() {
        guard let failure = content?.failure else { return }
        composer = failure.message
        update { $0.failure = nil }
    }

    public func acknowledgeDataUse() {
        guard let message = content?.acknowledgement else { return }
        dataUseAcknowledged = true
        update { $0.acknowledgement = nil }
        send(message)
    }

    public func declineDataUse() {
        guard let message = content?.acknowledgement else { return }
        composer = message
        update { $0.acknowledgement = nil }
    }

    private func runTurn(_ message: String) async {
        do {
            let conversation = try await ensureConversation()
            var reply: ChatReply?
            var streamError: ChatStreamError?
            let request = ChatRequest(message: message, conversationId: conversation.id, dataUseAcknowledged: dataUseAcknowledged)
            try await repositories.assistant.send(request) { event in
                switch event {
                case .message(let delivered): reply = delivered
                case .error(let error): streamError = error
                case .accepted, .toolStart, .toolEnd, .composing, .ping:
                    self.update { content in
                        guard let progress = content.turn?.progress else { return }
                        content.turn?.progress = progress.advanced(by: event)
                    }
                }
            }
            if let streamError {
                finishTurn(failure: .streamFailed(streamError, message: message, now: now()))
            } else if let reply {
                deliver(reply, for: message, in: conversation)
            } else {
                finishTurn(failure: .interrupted(message: message))
            }
        } catch is CancellationError {
            // Closed because the app stayed in the background; returning reads the conversation again.
            return
        } catch let error as AppError {
            if case .validation(let server, _) = error, server.code == "DATA_USE_ACKNOWLEDGEMENT_REQUIRED" {
                update {
                    $0.turn = nil
                    $0.acknowledgement = message
                }
            } else {
                finishTurn(failure: .refused(error, message: message, now: now()))
            }
        } catch {
            finishTurn(failure: .refused(.server(ServerMessage()), message: message, now: now()))
        }
    }

    /// The first message creates the conversation, so the server owns its history from the start.
    private func ensureConversation() async throws -> Conversation {
        if let conversation = content?.conversation { return conversation }
        let created = try await repositories.assistant.createConversation()
        update { $0.conversation = created }
        return created
    }

    func finishTurn(failure: ChatFailure) {
        update {
            $0.turn = nil
            $0.failure = failure
        }
    }

    private func deliver(_ reply: ChatReply, for message: String, in conversation: Conversation) {
        let replyID = UUID().uuidString
        let entry = ChatEntry(
            id: replyID,
            body: .michael(
                MichaelReply(
                    lines: ReplyFormat.parse(reply.content),
                    toolActivity: reply.toolActivity,
                    usedSavedData: reply.usedSavedData,
                    drafts: reply.drafts.enumerated().map { index, draft in
                        DraftCard(id: "\(replyID)-\(index)", form: DraftForm(draft))
                    },
                    hasPlanningProposal: reply.planningProposal != nil
                )
            )
        )
        update {
            $0.turn = nil
            $0.entries.append(ChatEntry(id: UUID().uuidString, body: .user(message)))
            $0.entries.append(entry)
            $0.revealing = replyID
            $0.conversation?.messageCount += 2
            $0.conversation?.lastMessageAt = now()
        }
        // The reveal is the screen's to pace, but it never outlasts its cap, so the orb cannot stay "responding" if
        // the reply scrolls away or the app goes to the background mid-reveal.
        _Concurrency.Task {
            try? await _Concurrency.Task.sleep(for: ReplyReveal.limit)
            finishReveal(replyID)
        }
        // The server names a conversation after its first message.
        if conversation.messageCount == 0 {
            _Concurrency.Task { await self.refreshTitle(conversation.id) }
        }
    }

    private func refreshTitle(_ id: Conversation.ID) async {
        guard let named = try? await repositories.assistant.messages(id, page: 1).conversation, conversationID == id else { return }
        update { $0.conversation?.title = named.title }
    }

    /// The reply has been revealed, or shown at once under Reduce Motion.
    func finishReveal(_ id: ChatEntry.ID) {
        update { if $0.revealing == id { $0.revealing = nil } }
    }

    /// A reply in flight is closed if the app stays in the background past a short grace period.
    public func enterBackground() {
        guard isBusy else { return }
        graceTask?.cancel()
        graceTask = _Concurrency.Task {
            try? await _Concurrency.Task.sleep(for: backgroundGrace)
            guard !_Concurrency.Task.isCancelled, isBusy else { return }
            cutByBackground = true
            turnTask?.cancel()
        }
    }

    /// The server saves only completed exchanges, so a closed reply is read back from it, never resumed.
    public func enterForeground() async {
        graceTask?.cancel()
        guard cutByBackground, let message = content?.turn?.message else { return }
        cutByBackground = false
        guard let id = conversationID else {
            finishTurn(failure: .backgrounded(message: message))
            return
        }
        update { $0.turn = nil }
        await open(id, knownCount: nil)
        if content != nil, !replied(to: message) { update { $0.failure = .backgrounded(message: message) } }
    }

    /// A question handed over from another screen goes in the composer, unsent. It starts a new chat unless a
    /// reply is in flight.
    public func prefill(_ prompt: String) {
        if !isBusy, content.map({ !$0.isEmpty || $0.conversation != nil }) ?? true { startNewChat() }
        composer = prompt
    }

    public func startNewChat() {
        guard !isBusy else { return }
        readGeneration += 1
        state = .chat(ChatContent())
    }
}
