import DesignSystem
import Models
import SwiftUI

/// A question handed over from another screen. Each handover is new, even when the text repeats.
public struct AssistantPrompt: Equatable, Sendable {
    public let id = UUID()
    public let text: String

    public init(_ text: String) {
        self.text = text
    }
}

public struct AssistantActions {
    let open: (AssistantModel.Destination) -> Void
    let finishSetup: () -> Void
    let reviewPlan: (PlanningProposal) -> Void

    public init(
        open: @escaping (AssistantModel.Destination) -> Void, finishSetup: @escaping () -> Void,
        reviewPlan: @escaping (PlanningProposal) -> Void
    ) {
        self.open = open
        self.finishSetup = finishSetup
        self.reviewPlan = reviewPlan
    }
}

public struct AssistantScreen: View {
    @State private var model: AssistantModel
    @State private var history: HistoryModel
    @Binding private var savedConversation: String
    @Binding private var savedComposer: String
    private let prompt: AssistantPrompt?
    private let actions: AssistantActions
    @State private var restored = false
    @State private var handledPrompt: UUID?
    @State private var showingHistory = false
    @FocusState private var composerFocused: Bool
    @Environment(\.scenePhase) private var scenePhase

    /// `conversation` and `composer` are kept by the app across relaunch and cleared when the account changes.
    public init(
        repositories: AssistantRepositories,
        conversation: Binding<String>,
        composer: Binding<String>,
        prompt: AssistantPrompt?,
        actions: AssistantActions
    ) {
        _model = State(initialValue: AssistantModel(repositories: repositories))
        _history = State(initialValue: HistoryModel(assistant: repositories.assistant))
        _savedConversation = conversation
        _savedComposer = composer
        self.prompt = prompt
        self.actions = actions
    }

    public var body: some View {
        VStack(spacing: 0) {
            ChatHeader(
                title: model.content?.conversation?.title ?? String(localized: "chat.newConversation", bundle: .module),
                presence: model.presence,
                progressLine: model.content?.turn?.progress.line,
                canStartNew: !model.isBusy,
                onHistory: { showingHistory = true },
                onNewChat: model.startNewChat
            )
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            ComposerBar(model: model, focused: $composerFocused)
        }
        .background(MichaelBackground())
        .toolbar(.hidden, for: .navigationBar)
        .task { await restore() }
        .onChange(of: model.composer) { _, text in savedComposer = text }
        .onChange(of: model.conversationID) { _, id in
            if let id { savedConversation = id } else if case .chat = model.state { savedConversation = "" }
        }
        .onChange(of: prompt, initial: true) { _, prompt in handOver(prompt) }
        .onChange(of: composerFocused) { _, focused in model.composerFocused = focused }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .background: model.enterBackground()
            case .active: _Concurrency.Task { await model.enterForeground() }
            case .inactive: break
            @unknown default: break
            }
        }
        .sheet(isPresented: $showingHistory) {
            HistorySheet(model: history, current: model.conversationID, actions: historyActions)
        }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .opening:
            ChatSkeleton()
        case .failed(let error, let id):
            FailureStateView(message: error.openMessage) {
                _Concurrency.Task { await model.open(id, knownCount: nil) }
            }
        case .chat(let content):
            if content.isEmpty {
                ChatEmptyView(canSend: model.canSendSuggestion, onSuggestion: model.send)
            } else {
                ChatTranscript(content: content, model: model, actions: transcriptActions)
            }
        }
    }

    private var transcriptActions: TranscriptActions {
        TranscriptActions(
            failure: FailureRowActions(
                retry: model.retry,
                edit: {
                    model.editFailed()
                    composerFocused = true
                },
                newChat: model.startNewChat,
                finishSetup: actions.finishSetup,
                openHistory: { showingHistory = true }
            ),
            open: actions.open,
            reviewPlan: actions.reviewPlan
        )
    }

    private var historyActions: HistoryActions {
        HistoryActions(
            open: { conversation in
                showingHistory = false
                _Concurrency.Task { await model.open(conversation.id, knownCount: conversation.messageCount) }
            },
            newChat: {
                showingHistory = false
                model.startNewChat()
            },
            renamed: model.renamed,
            removed: model.deleted
        )
    }

    private func restore() async {
        guard !restored else { return }
        restored = true
        if model.composer.isEmpty { model.composer = savedComposer }
        if model.conversationID == nil, !savedConversation.isEmpty {
            await model.open(savedConversation, knownCount: nil)
        }
    }

    private func handOver(_ prompt: AssistantPrompt?) {
        guard let prompt, prompt.id != handledPrompt else { return }
        handledPrompt = prompt.id
        model.prefill(prompt.text)
    }
}

extension AppError {
    fileprivate var openMessage: String {
        switch self {
        case .offline: String(localized: "chat.open.offline", bundle: .module)
        case .notFound: String(localized: "chat.conversationGone", bundle: .module)
        default: String(localized: "chat.open.failed", bundle: .module)
        }
    }
}

private struct ChatHeader: View {
    let title: String
    let presence: PresenceState
    let progressLine: String?
    let canStartNew: Bool
    let onHistory: () -> Void
    let onNewChat: () -> Void

    var body: some View {
        HStack(spacing: MichaelSpace.md) {
            MichaelOrb(activity: presence.isWorking ? .thinking : .idle, size: .small)
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .michaelText(.label)
                    .foregroundStyle(Color.michael.text)
                    .lineLimit(1)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("chat.title")
                Text(progressLine ?? (presence == .idle ? String(localized: "chat.michael", bundle: .module) : presence.label))
                    .michaelText(.caption)
                    .foregroundStyle(progressLine == nil && presence != .error ? Color.michael.muted : statusColor)
                    .lineLimit(2)
                    .accessibilityAddTraits(.updatesFrequently)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            iconButton("clock.arrow.circlepath", label: "chat.history", action: onHistory)
            iconButton("square.and.pencil", label: "chat.newChat", action: onNewChat)
                .disabled(!canStartNew)
        }
        .padding(.leading, MichaelSpace.lg)
        .padding(.trailing, MichaelSpace.sm)
        .padding(.vertical, MichaelSpace.sm)
        .background(.bar)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.michael.border).frame(height: 1) }
    }

    private var statusColor: Color {
        presence == .error ? Color.michael.danger : Color.michael.atext
    }

    private func iconButton(_ symbol: String, label: String.LocalizationValue, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .foregroundStyle(Color.michael.muted)
                .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: label, bundle: .module))
    }
}

private struct ChatEmptyView: View {
    let canSend: Bool
    let onSuggestion: (String) -> Void

    private let suggestions: [String.LocalizationValue] = [
        "chat.suggestion.focus", "chat.suggestion.overdue", "chat.suggestion.week", "chat.suggestion.reorganize",
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: MichaelSpace.xl) {
                ZStack {
                    Circle()
                        .strokeBorder(Color.michael.chipBorder)
                        .frame(width: MichaelSize.orbLarge * 1.25, height: MichaelSize.orbLarge * 1.25)
                    MichaelOrb(size: .large)
                }
                VStack(spacing: MichaelSpace.sm) {
                    Text(String(localized: "chat.empty.title", bundle: .module))
                        .michaelText(.title)
                        .foregroundStyle(Color.michael.text)
                        .accessibilityAddTraits(.isHeader)
                    Text(String(localized: "chat.empty.body", bundle: .module))
                        .michaelText(.body)
                        .foregroundStyle(Color.michael.muted)
                }
                .multilineTextAlignment(.center)
                VStack(spacing: MichaelSpace.sm) {
                    ForEach(suggestions.indices, id: \.self) { index in
                        let text = String(localized: suggestions[index], bundle: .module)
                        Button {
                            onSuggestion(text)
                        } label: {
                            Text(text)
                                .michaelText(.body)
                                .foregroundStyle(Color.michael.text)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, MichaelSpace.lg)
                                .padding(.vertical, MichaelSpace.md)
                                .frame(minHeight: MichaelSize.button)
                                .background(Color.michael.surface, in: RoundedRectangle(cornerRadius: MichaelRadius.stat))
                                .overlay { RoundedRectangle(cornerRadius: MichaelRadius.stat).strokeBorder(Color.michael.border2) }
                        }
                        .buttonStyle(.plain)
                        .disabled(!canSend)
                    }
                }
            }
            .padding(.horizontal, MichaelSpace.screenGutter)
            .padding(.vertical, MichaelSpace.xxl)
        }
        .scrollBounceBehavior(.basedOnSize)
    }
}

private struct ChatSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.lg) {
            HStack {
                Spacer(minLength: MichaelSpace.xxl)
                SkeletonBlock(height: MichaelSize.button, cornerRadius: MichaelRadius.stat)
            }
            SkeletonBlock(height: MichaelSpace.lg)
            SkeletonBlock(height: MichaelSpace.lg)
            SkeletonBlock(height: MichaelSpace.lg).padding(.trailing, MichaelSpace.xxl)
            Spacer(minLength: 0)
        }
        .padding(MichaelSpace.screenGutter)
        .accessibilityElement()
        .accessibilityLabel(String(localized: "chat.opening", bundle: .module))
    }
}
