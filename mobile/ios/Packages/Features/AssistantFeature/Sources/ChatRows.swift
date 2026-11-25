import DesignSystem
import Models
import SwiftUI
import UIKit

struct UserBubble: View {
    let text: String

    var body: some View {
        Text(verbatim: text)
            .michaelText(.body)
            .foregroundStyle(Color.michael.text)
            .padding(.horizontal, MichaelSpace.lg)
            .padding(.vertical, MichaelSpace.md)
            .background(Color.michael.raise, in: UnevenRoundedRectangle(cornerRadii: MichaelRadius.bubble))
            .overlay { UnevenRoundedRectangle(cornerRadii: MichaelRadius.bubble).strokeBorder(Color.michael.border) }
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(.leading, MichaelSpace.xxl)
            .textSelection(.enabled)
            .accessibilityLabel(String(localized: "chat.you \(text)", bundle: .module))
    }
}

struct MichaelReplyView: View {
    let reply: MichaelReply
    let revealing: Bool
    let onRevealed: () -> Void
    let draftActions: (DraftCard.ID) -> DraftCardActions
    let openCalendar: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.md) {
            if !reply.toolActivity.isEmpty {
                ChipFlow(items: reply.toolActivity.map { ($0.name, $0.status) })
            } else if !reply.usedSavedData {
                MichaelChip(String(localized: "chat.noSavedData", bundle: .module), tone: .plain)
            }
            ReplyText(lines: reply.lines, reveal: revealing, onRevealed: onRevealed)
                .contextMenu {
                    Button(String(localized: "chat.copy", bundle: .module), systemImage: "doc.on.doc") {
                        UIPasteboard.general.string = reply.plainText
                    }
                }
            if reply.hasPlanningProposal {
                PlanPointer(openCalendar: openCalendar)
            }
            ForEach(reply.drafts) { card in
                DraftCardView(card: card, actions: draftActions(card.id))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Tool chips under a reply: the source Michael read, ticked when it answered.
private struct ChipFlow: View {
    let items: [(String, ToolStatus)]

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: MichaelSpace.sm) { chips }
            VStack(alignment: .leading, spacing: MichaelSpace.sm) { chips }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "chat.sources \(sources)", bundle: .module))
    }

    private var sources: String {
        items.map { ToolLabel.of($0.0).label }.formatted(.list(type: .and))
    }

    @ViewBuilder private var chips: some View {
        ForEach(items.indices, id: \.self) { index in
            let (name, status) = items[index]
            MichaelChip(
                status == .completed
                    ? ToolLabel.of(name).label
                    : String(localized: "chat.toolUnavailable \(ToolLabel.of(name).label)", bundle: .module),
                tone: status == .completed ? .ai : .plain
            )
        }
    }
}

private struct PlanPointer: View {
    let openCalendar: () -> Void

    var body: some View {
        AICard {
            VStack(alignment: .leading, spacing: MichaelSpace.sm) {
                Text(String(localized: "chat.plan.title", bundle: .module))
                    .michaelText(.eyebrow)
                    .foregroundStyle(Color.michael.atext)
                Text(String(localized: "chat.plan.body", bundle: .module))
                    .michaelText(.label)
                    .foregroundStyle(Color.michael.text)
                MichaelButton(String(localized: "chat.plan.open", bundle: .module), style: .secondary, size: .small, action: openCalendar)
                    .fixedSize()
            }
        }
    }
}

/// The message just sent and what Michael is doing about it. Every line is a stream event that happened.
struct TurnView: View {
    let turn: Turn

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.md) {
            UserBubble(text: turn.message)
            VStack(alignment: .leading, spacing: MichaelSpace.sm) {
                ForEach(turn.progress.tools.indices, id: \.self) { index in
                    let tool = turn.progress.tools[index]
                    if tool.run != .running {
                        step(ToolLabel.of(tool.name).label, done: true)
                    }
                }
                step(turn.progress.line, done: false)
            }
            .accessibilityElement(children: .combine)
            Text(String(localized: "chat.working.note", bundle: .module))
                .michaelText(.caption)
                .foregroundStyle(Color.michael.faint)
        }
    }

    private func step(_ text: String, done: Bool) -> some View {
        HStack(spacing: MichaelSpace.sm) {
            if done {
                Image(systemName: "checkmark")
                    .michaelText(.caption)
                    .foregroundStyle(Color.michael.atext)
                    .frame(width: MichaelSize.check, height: MichaelSize.check)
                    .background(Color.michael.chip, in: Circle())
                    .overlay { Circle().strokeBorder(Color.michael.chipBorder) }
            } else {
                TypingDots().frame(width: MichaelSize.check)
            }
            Text(text)
                .michaelText(.label)
                .foregroundStyle(done ? Color.michael.muted : Color.michael.text)
        }
    }
}

struct FailureRowActions {
    let retry: () -> Void
    let edit: () -> Void
    let newChat: () -> Void
    let finishSetup: () -> Void
    let openHistory: () -> Void
}

struct FailureRow: View {
    let failure: ChatFailure
    let actions: FailureRowActions

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.md) {
            UserBubble(text: failure.message)
            HStack(alignment: .top, spacing: MichaelSpace.sm) {
                Image(systemName: "exclamationmark.circle")
                    .foregroundStyle(Color.michael.danger)
                    .accessibilityHidden(true)
                Text(failure.reason)
                    .michaelText(.label)
                    .foregroundStyle(Color.michael.text)
            }
            action
        }
        .sensoryFeedback(.warning, trigger: failure)
    }

    @ViewBuilder private var action: some View {
        switch failure.action {
        case .retry, .reloadThenRetry:
            button("chat.action.retry", actions.retry)
        case .retryAfter(let date):
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let seconds = Int(date.timeIntervalSince(context.date).rounded(.up))
                if seconds > 0 {
                    Text(String(localized: "chat.action.waitSeconds \(seconds)", bundle: .module))
                        .michaelText(.label)
                        .foregroundStyle(Color.michael.muted)
                        .monospacedDigit()
                } else {
                    button("chat.action.retry", actions.retry)
                }
            }
        case .edit: button("chat.action.edit", actions.edit)
        case .newChat: button("chat.action.newChat", actions.newChat)
        case .finishSetup: button("chat.action.finishSetup", actions.finishSetup)
        case .openHistory: button("chat.action.openHistory", actions.openHistory)
        case .none: EmptyView()
        }
    }

    private func button(_ key: String.LocalizationValue, _ action: @escaping () -> Void) -> some View {
        MichaelButton(String(localized: key, bundle: .module), style: .secondary, size: .small, action: action)
            .fixedSize()
    }
}

/// The AI provider's data terms ask for the user's word before this message is processed. Asked once a session.
struct DataUseNotice: View {
    let message: String
    let onAccept: () -> Void
    let onDecline: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.md) {
            UserBubble(text: message)
            MichaelCard {
                VStack(alignment: .leading, spacing: MichaelSpace.md) {
                    Text(String(localized: "dataUse.title", bundle: .module))
                        .michaelText(.heading)
                        .foregroundStyle(Color.michael.text)
                        .accessibilityAddTraits(.isHeader)
                    Text(String(localized: "dataUse.body", bundle: .module))
                        .michaelText(.body)
                        .foregroundStyle(Color.michael.muted)
                    MichaelButton(String(localized: "dataUse.accept", bundle: .module), action: onAccept)
                    MichaelButton(String(localized: "dataUse.decline", bundle: .module), style: .ghost, action: onDecline)
                }
            }
        }
    }
}
