import DesignSystem
import Models
import SwiftUI

struct TranscriptActions {
    let failure: FailureRowActions
    let open: (AssistantModel.Destination) -> Void
}

struct ChatTranscript: View {
    let content: ChatContent
    let model: AssistantModel
    let actions: TranscriptActions

    private static let bottom = "bottom"

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: MichaelSpace.lg) {
                    if content.earlierPage != nil {
                        MichaelButton(String(localized: "chat.earlier", bundle: .module), style: .ghost, size: .small) {
                            _Concurrency.Task { await model.loadEarlier() }
                        }
                        .disabled(content.loadingEarlier)
                        .frame(maxWidth: .infinity)
                    }
                    ForEach(content.entries) { entry in
                        row(entry)
                    }
                    if let turn = content.turn {
                        TurnView(turn: turn)
                    }
                    if let failure = content.failure {
                        FailureRow(failure: failure, actions: actions.failure)
                    }
                    if let message = content.acknowledgement {
                        DataUseNotice(message: message, onAccept: model.acknowledgeDataUse, onDecline: model.declineDataUse)
                    }
                    Color.clear.frame(height: 1).id(Self.bottom)
                }
                .padding(.horizontal, MichaelSpace.screenGutter)
                .padding(.vertical, MichaelSpace.lg)
            }
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: content.entries.count) { _, _ in scrollToEnd(proxy) }
            .onChange(of: content.turn?.message) { _, _ in scrollToEnd(proxy) }
            .onChange(of: content.failure) { _, _ in scrollToEnd(proxy) }
            .onChange(of: content.acknowledgement) { _, _ in scrollToEnd(proxy) }
        }
    }

    @ViewBuilder private func row(_ entry: ChatEntry) -> some View {
        switch entry.body {
        case .user(let text):
            UserBubble(text: text)
        case .michael(let reply):
            MichaelReplyView(
                reply: reply,
                revealing: content.revealing == entry.id,
                onRevealed: { model.finishReveal(entry.id) },
                draftActions: { id in
                    DraftCardActions(
                        edit: { field, value in model.edit(id, field: field, to: value) },
                        save: { model.save(id) },
                        discard: { model.discard(id) },
                        open: actions.open
                    )
                },
                openCalendar: { actions.open(.calendar) }
            )
        }
    }

    /// Back to the newest message, even if the user had scrolled up to reread, unless loading older ones.
    private func scrollToEnd(_ proxy: ScrollViewProxy) {
        guard !content.loadingEarlier else { return }
        withAnimation(.easeOut(duration: MichaelMotion.progress)) { proxy.scrollTo(Self.bottom, anchor: .bottom) }
    }
}

struct ComposerBar: View {
    let model: AssistantModel
    var focused: FocusState<Bool>.Binding

    var body: some View {
        @Bindable var model = model
        VStack(alignment: .trailing, spacing: MichaelSpace.xs) {
            if model.composerCount >= AssistantModel.countFrom {
                Text(String(localized: "chat.count \(model.composerCount) \(AssistantModel.messageLimit)", bundle: .module))
                    .michaelText(.caption)
                    .monospacedDigit()
                    .foregroundStyle(model.composerCount > AssistantModel.messageLimit ? Color.michael.danger : Color.michael.muted)
            }
            HStack(alignment: .bottom, spacing: MichaelSpace.sm) {
                TextField(
                    String(localized: model.isBusy ? "chat.composer.working" : "chat.composer", bundle: .module),
                    text: $model.composer,
                    axis: .vertical
                )
                .lineLimit(1...5)
                .michaelText(.body)
                .foregroundStyle(Color.michael.text)
                .tint(Color.michael.accent)
                .focused(focused)
                .padding(.vertical, MichaelSpace.md)
                .accessibilityLabel(String(localized: "chat.composer.label", bundle: .module))
                Button(action: model.sendComposer) {
                    Image(systemName: "arrow.up")
                        .michaelText(.button)
                        .foregroundStyle(model.canSend ? Color.michael.onfill : Color.michael.faint)
                        .frame(width: MichaelSize.buttonSmall, height: MichaelSize.buttonSmall)
                        .background(
                            model.canSend ? Color.michael.fill : Color.michael.raise,
                            in: RoundedRectangle(cornerRadius: MichaelRadius.buttonSmall)
                        )
                        .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(!model.canSend)
                .accessibilityLabel(String(localized: "chat.send", bundle: .module))
            }
            .padding(.leading, MichaelSpace.md)
            .padding(.trailing, MichaelSpace.xs)
            .background(Color.michael.surface, in: RoundedRectangle(cornerRadius: MichaelRadius.stat))
            .overlay { RoundedRectangle(cornerRadius: MichaelRadius.stat).strokeBorder(Color.michael.border2) }
        }
        .padding(.horizontal, MichaelSpace.md)
        .padding(.vertical, MichaelSpace.sm)
        .background(.bar)
        .overlay(alignment: .top) { Rectangle().fill(Color.michael.border).frame(height: 1) }
    }
}
