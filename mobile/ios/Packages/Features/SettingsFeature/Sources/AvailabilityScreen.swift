import DesignSystem
import Models
import SwiftUI

/// The weekly hours Michael may plan focus sessions in, a card per weekday.
struct AvailabilityScreen: View {
    @State private var model: AvailabilityEditorModel
    let onSaved: () -> Void
    @State private var editing: EditedWindow?
    @Environment(\.dismiss) private var dismiss

    init(model: @autoclosure () -> AvailabilityEditorModel, onSaved: @escaping () -> Void) {
        _model = State(initialValue: model())
        self.onSaved = onSaved
    }

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MichaelBackground())
            .navigationTitle(String(localized: "settings.availability", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    if model.saving {
                        ProgressView()
                    } else {
                        Button(String(localized: "settings.save", bundle: .module)) { _Concurrency.Task { await model.save() } }
                            .disabled(!model.canSave)
                    }
                }
            }
            .task { await model.load() }
            .onChange(of: model.saved) { _, saved in
                if saved {
                    onSaved()
                    dismiss()
                }
            }
            .sheet(item: $editing) { edited in
                WindowSheet(model: model, id: edited.id)
                    .presentationDetents([.medium])
            }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            ProgressView()
        case .failed(let error):
            FailureStateView(message: SettingsFormat.message(error)) { _Concurrency.Task { await model.load() } }
        case .editing:
            week
        }
    }

    private var week: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MichaelSpace.md) {
                Text(String(localized: "settings.availability.intro \(model.plan.timeZone)", bundle: .module))
                    .michaelText(.body)
                    .foregroundStyle(Color.michael.muted)
                if let failure = model.failure { ErrorBanner(message: SettingsFormat.message(failure)) }
                MichaelCard {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(1...7, id: \.self) { weekday in
                            day(weekday)
                            if weekday < 7 { Divider().overlay(Color.michael.border) }
                        }
                    }
                }
                Text(String(localized: "settings.availability.note", bundle: .module))
                    .michaelText(.caption)
                    .foregroundStyle(Color.michael.faint)
            }
            .padding(.horizontal, MichaelSpace.screenGutter)
            .padding(.bottom, MichaelSpace.xl)
        }
    }

    private func day(_ weekday: Int) -> some View {
        let slots = model.plan.slots(on: weekday)
        let problems = model.plan.problems(on: weekday)
        let name = SettingsFormat.weekday(weekday)
        return VStack(alignment: .leading, spacing: MichaelSpace.sm) {
            HStack {
                Text(name).michaelText(.heading).foregroundStyle(Color.michael.text)
                Spacer()
                if slots.isEmpty {
                    Text(String(localized: "settings.availability.none", bundle: .module))
                        .michaelText(.label)
                        .foregroundStyle(Color.michael.muted)
                }
                Button {
                    var added: AvailabilityPlan.Slot.ID?
                    model.edit { added = $0.add(on: weekday) }
                    editing = added.map(EditedWindow.init)
                } label: {
                    Image(systemName: "plus")
                        .foregroundStyle(Color.michael.atext)
                        .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(!model.plan.canAdd)
                .accessibilityLabel(String(localized: "settings.availability.add \(name)", bundle: .module))
            }
            if !slots.isEmpty {
                FlowRow(spacing: MichaelSpace.sm) {
                    ForEach(slots) { slot in
                        WindowChip(window: slot.window, invalid: model.plan.problem(slot.id) != nil) { editing = EditedWindow(id: slot.id) }
                    }
                }
            }
            if problems.contains(.overlap) {
                problem(String(localized: "settings.availability.overlap", bundle: .module))
            }
            if problems.contains(.order) {
                problem(String(localized: "settings.availability.order", bundle: .module))
            }
        }
        .padding(.vertical, MichaelSpace.sm)
    }

    private func problem(_ text: String) -> some View {
        Text(text)
            .michaelText(.caption)
            .foregroundStyle(Color.michael.danger)
            .accessibilityAddTraits(.isStaticText)
    }
}

private struct EditedWindow: Identifiable {
    let id: AvailabilityPlan.Slot.ID
}

private struct WindowChip: View {
    let window: AvailabilityWindow
    let invalid: Bool
    let open: () -> Void

    var body: some View {
        Button(action: open) {
            Text(SettingsFormat.range(window))
                .michaelText(.label)
                .monospacedDigit()
                .foregroundStyle(invalid ? Color.michael.danger : (window.active ? Color.michael.text : Color.michael.faint))
                .strikethrough(!window.active)
                .padding(.horizontal, MichaelSpace.md)
                .frame(minHeight: MichaelSize.checkTouch)
                .background(Color.michael.raise, in: RoundedRectangle(cornerRadius: MichaelRadius.field))
                .overlay {
                    RoundedRectangle(cornerRadius: MichaelRadius.field).strokeBorder(invalid ? Color.michael.danger : Color.michael.border2)
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(SettingsFormat.range(window))
        .accessibilityValue(
            window.active
                ? String(localized: "settings.availability.active", bundle: .module)
                : String(localized: "settings.availability.paused", bundle: .module)
        )
        .accessibilityHint(String(localized: "settings.availability.edit", bundle: .module))
    }
}

/// One window: its times, whether Michael may use it, and remove.
private struct WindowSheet: View {
    let model: AvailabilityEditorModel
    let id: AvailabilityPlan.Slot.ID
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            if let slot = model.plan.slots.first(where: { $0.id == id }) {
                VStack(alignment: .leading, spacing: MichaelSpace.md) {
                    TimeRow(label: String(localized: "settings.availability.start", bundle: .module), time: field(\.startTime, slot))
                    TimeRow(label: String(localized: "settings.availability.end", bundle: .module), time: field(\.endTime, slot))
                    MichaelToggle(String(localized: "settings.availability.use", bundle: .module), isOn: field(\.active, slot))
                    if let problem = model.plan.problem(id) {
                        Text(
                            problem == .order
                                ? String(localized: "settings.availability.order", bundle: .module)
                                : String(localized: "settings.availability.overlap", bundle: .module)
                        )
                        .michaelText(.caption)
                        .foregroundStyle(Color.michael.danger)
                    }
                    Spacer()
                    MichaelButton(String(localized: "settings.availability.remove", bundle: .module), style: .destructive) {
                        model.edit { $0.remove(id) }
                        dismiss()
                    }
                }
                .padding(MichaelSpace.screenGutter)
                .navigationTitle(SettingsFormat.weekday(slot.window.weekday))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(String(localized: "settings.done", bundle: .module)) { dismiss() }
                    }
                }
            }
        }
        .background(MichaelBackground())
        .tint(Color.michael.accent)
    }

    private func field<Value>(_ keyPath: WritableKeyPath<AvailabilityWindow, Value>, _ slot: AvailabilityPlan.Slot) -> Binding<Value> {
        Binding(
            get: { model.plan.slots.first { $0.id == id }?.window[keyPath: keyPath] ?? slot.window[keyPath: keyPath] },
            set: { value in model.edit { $0.update(id) { $0[keyPath: keyPath] = value } } }
        )
    }
}

/// Lays its children in rows, wrapping when the width runs out.
struct FlowRow: Layout {
    let spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        let origins = arrange(width: width, subviews: subviews)
        let height = zip(origins, subviews).map { $0.y + $1.sizeThatFits(.unspecified).height }.max() ?? 0
        return CGSize(width: proposal.width ?? 0, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for (point, subview) in zip(arrange(width: bounds.width, subviews: subviews), subviews) {
            subview.place(at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y), proposal: .unspecified)
        }
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> [CGPoint] {
        var origins: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            origins.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return origins
    }
}
