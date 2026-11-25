import DesignSystem
import Models
import SwiftUI

struct DraftCardActions {
    let edit: (String, DraftValue?) -> Void
    let save: () -> Void
    let discard: () -> Void
    let open: (AssistantModel.Destination) -> Void
}

/// An unsaved record Michael proposed, as a real form. The AI border and "Not saved" mean nothing is saved yet;
/// the card says saved only after the create call has returned.
struct DraftCardView: View {
    let card: DraftCard
    let actions: DraftCardActions

    var body: some View {
        AICard {
            if card.status == .discarded {
                Text(String(localized: "draft.discarded", bundle: .module))
                    .michaelText(.label)
                    .foregroundStyle(Color.michael.muted)
            } else {
                VStack(alignment: .leading, spacing: MichaelSpace.md) {
                    header
                    if card.status != .saved, !missingLabels.isEmpty {
                        Text(String(localized: "draft.missing \(missingLabels.formatted(.list(type: .and)))", bundle: .module))
                            .michaelText(.caption)
                            .foregroundStyle(Color.michael.warn)
                    }
                    ForEach(card.form.fields, id: \.name) { field in
                        DraftFieldEditor(
                            field: field,
                            form: card.form,
                            missing: card.status != .saved && card.form.missing.contains(field.name),
                            error: card.fieldErrors[field.name],
                            onChange: { actions.edit(field.name, $0) }
                        )
                        .disabled(card.status != .editing)
                    }
                    if card.form.kind == .calendarEvent, card.status != .saved {
                        Text(String(localized: "draft.timeZone \(card.form.timeZone)", bundle: .module))
                            .michaelText(.caption)
                            .foregroundStyle(Color.michael.muted)
                    }
                    if let error = card.error {
                        Text(error)
                            .michaelText(.label)
                            .foregroundStyle(Color.michael.danger)
                    }
                    footer
                }
            }
        }
        .sensoryFeedback(.success, trigger: card.status == .saved) { _, saved in saved }
        .sensoryFeedback(.warning, trigger: card.error) { _, error in error != nil }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Self.title(card.form.kind))
    }

    private var header: some View {
        HStack {
            Text(Self.title(card.form.kind))
                .michaelText(.eyebrow)
                .foregroundStyle(Color.michael.atext)
            Spacer(minLength: MichaelSpace.sm)
            Text(statusText)
                .michaelText(.caption)
                .foregroundStyle(card.status == .saved ? Color.michael.atext : Color.michael.muted)
        }
    }

    @ViewBuilder private var footer: some View {
        if card.status == .saved {
            HStack(spacing: MichaelSpace.sm) {
                Text(String(localized: "draft.saved", bundle: .module))
                    .michaelText(.label)
                    .foregroundStyle(Color.michael.atext)
                if let destination = AssistantModel.destination(of: card.form.kind) {
                    MichaelButton(Self.openTitle(destination), style: .ghost, size: .small) { actions.open(destination) }
                        .fixedSize()
                }
            }
        } else {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: MichaelSpace.sm) { buttons }
                VStack(spacing: MichaelSpace.sm) { buttons }
            }
        }
    }

    @ViewBuilder private var buttons: some View {
        MichaelButton(Self.saveTitle(card.form.kind), action: actions.save)
            .disabled(card.status != .editing || card.form.submission == nil)
        MichaelButton(String(localized: "draft.discard", bundle: .module), style: .secondary, action: actions.discard)
            .disabled(card.status != .editing)
            .fixedSize(horizontal: true, vertical: false)
    }

    private var statusText: String {
        switch card.status {
        case .editing, .discarded: String(localized: "draft.status.notSaved", bundle: .module)
        case .saving: String(localized: "draft.status.saving", bundle: .module)
        case .saved: String(localized: "draft.status.saved", bundle: .module)
        }
    }

    private var missingLabels: [String] {
        card.form.missing.map { name in card.form.fields.first { $0.name == name }?.label ?? name }
    }

    static func title(_ kind: DraftKind) -> String {
        localizedKey("draft.title.\(kind.rawValue)")
    }

    static func saveTitle(_ kind: DraftKind) -> String {
        localizedKey("draft.save.\(kind.rawValue)")
    }

    static func openTitle(_ destination: AssistantModel.Destination) -> String {
        switch destination {
        case .tasks: String(localized: "draft.open.tasks", bundle: .module)
        case .goals: String(localized: "draft.open.goals", bundle: .module)
        case .habits: String(localized: "draft.open.habits", bundle: .module)
        case .calendar: String(localized: "draft.open.calendar", bundle: .module)
        case .settings: String(localized: "draft.open.settings", bundle: .module)
        }
    }
}
