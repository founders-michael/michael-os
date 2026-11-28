import DesignSystem
import Models
import SwiftUI

/// Create or edit a goal. Closing with unsaved changes asks first; the sheet closes once the server has the goal.
struct GoalEditorSheet: View {
    @State private var model: GoalEditorModel
    let onSaved: (Goal) -> Void
    @State private var confirmingDiscard = false
    @Environment(\.dismiss) private var dismiss

    init(model: @autoclosure () -> GoalEditorModel, onSaved: @escaping (Goal) -> Void) {
        _model = State(initialValue: model())
        self.onSaved = onSaved
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: MichaelSpace.lg) {
                    if let failure = model.failure { ErrorBanner(message: GoalFormat.loadMessage(failure)) }
                    MichaelTextField(
                        String(localized: "goals.editor.title", bundle: .module),
                        text: Binding(get: { model.form.title }, set: { value in model.edit { $0.title = value } }),
                        error: model.serverErrors["title"]
                            ?? (model.showsProblems && model.form.titleMissing
                                ? String(localized: "goals.editor.problem.title", bundle: .module) : nil)
                    )
                    notes
                    MichaelTextField(
                        String(localized: "goals.editor.category", bundle: .module),
                        text: Binding(get: { model.form.category }, set: { value in model.edit { $0.category = value } }),
                        error: model.serverErrors["category"]
                    )
                    target
                    if model.form.editsProgress { progress }
                }
                .padding(MichaelSpace.screenGutter)
            }
            .background(MichaelBackground())
            .navigationTitle(
                model.goal == nil
                    ? String(localized: "goals.editor.new", bundle: .module) : String(localized: "goals.editor.edit", bundle: .module)
            )
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "goals.editor.cancel", bundle: .module)) {
                        if model.hasChanges { confirmingDiscard = true } else { dismiss() }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if model.saving {
                        ProgressView()
                    } else {
                        Button(String(localized: "goals.editor.save", bundle: .module)) { _Concurrency.Task { await model.save() } }
                    }
                }
            }
            .confirmationDialog(
                String(localized: "goals.editor.discard", bundle: .module), isPresented: $confirmingDiscard, titleVisibility: .visible
            ) {
                Button(String(localized: "goals.editor.discard.confirm", bundle: .module), role: .destructive) { dismiss() }
            }
        }
        .interactiveDismissDisabled(model.hasChanges || model.saving)
        .onChange(of: model.saved) { _, saved in
            if let saved {
                onSaved(saved)
                dismiss()
            }
        }
    }

    private var notes: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            Text(String(localized: "goals.editor.notes", bundle: .module)).michaelText(.label).foregroundStyle(Color.michael.muted)
            TextField("", text: Binding(get: { model.form.notes }, set: { value in model.edit { $0.notes = value } }), axis: .vertical)
                .lineLimit(2...6)
                .accessibilityLabel(String(localized: "goals.editor.notes", bundle: .module))
                .michaelFieldFrame()
        }
    }

    private var target: some View {
        let label = String(localized: "goals.editor.target", bundle: .module)
        return VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            HStack {
                Text(label).michaelText(.body).foregroundStyle(Color.michael.text)
                Spacer(minLength: MichaelSpace.sm)
                if let date = model.form.targetDate {
                    DatePicker(
                        label,
                        selection: Binding(
                            get: { PickerClock.date(date) }, set: { value in model.edit { $0.targetDate = PickerClock.localDate(value) } }),
                        displayedComponents: .date
                    )
                    .labelsHidden()
                    .environment(\.timeZone, PickerClock.timeZone)
                    Button {
                        model.edit { $0.targetDate = nil }
                    } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(Color.michael.faint)
                            .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(String(localized: "goals.editor.clearTarget", bundle: .module))
                } else {
                    Button(String(localized: "goals.editor.addTarget", bundle: .module)) {
                        model.edit { $0.targetDate = PickerClock.localDate(.now) }
                    }
                }
            }
            .michaelFieldFrame()
            if let error = model.serverErrors["targetDate"] {
                Text(error).michaelText(.caption).foregroundStyle(Color.michael.danger)
            }
        }
    }

    private var progress: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            HStack {
                Text(String(localized: "goals.detail.progress", bundle: .module)).michaelText(.label).foregroundStyle(Color.michael.muted)
                Spacer()
                Text("\(model.form.progress)%").michaelText(.label).foregroundStyle(Color.michael.atext).monospacedDigit()
            }
            Slider(
                value: Binding(get: { Double(model.form.progress) }, set: { value in model.edit { $0.progress = Int(value) } }),
                in: 0...100, step: 5
            )
            .tint(Color.michael.accent)
            .accessibilityLabel(String(localized: "goals.detail.progress", bundle: .module))
            Text(String(localized: "goals.detail.progressHint", bundle: .module)).michaelText(.caption).foregroundStyle(Color.michael.faint)
        }
    }
}

/// Server dates are calendar dates in the profile's zone, shown on a UTC clock so no zone shifts them.
enum GoalFormat {
    static func date(_ date: LocalDate) -> String {
        PickerClock.date(date).formatted(Date.FormatStyle(timeZone: PickerClock.timeZone).day().month(.abbreviated).year())
    }

    static func status(_ status: GoalStatus) -> String {
        switch status {
        case .active, .unknown: String(localized: "goals.status.active", bundle: .module)
        case .completed: String(localized: "goals.status.completed", bundle: .module)
        case .archived: String(localized: "goals.status.archived", bundle: .module)
        }
    }

    static func milestones(_ goal: Goal) -> String {
        goal.milestoneCount == 0
            ? String(localized: "goals.milestones.none.short", bundle: .module)
            : String(localized: "goals.milestones.of \(goal.completedMilestoneCount) \(goal.milestoneCount)", bundle: .module)
    }

    static func target(_ target: GoalTarget) -> String {
        switch target {
        case .none: String(localized: "goals.target.none", bundle: .module)
        case .passed(let date): String(localized: "goals.target.passed \(Self.date(date))", bundle: .module)
        case .today: String(localized: "goals.target.today", bundle: .module)
        case .inDays(let days): String(localized: "goals.target.inDays \(days)", bundle: .module)
        case .onDate(let date): String(localized: "goals.target.on \(Self.date(date))", bundle: .module)
        }
    }

    static func isWarning(_ target: GoalTarget) -> Bool {
        if case .passed = target { return true }
        return false
    }

    /// The web's `goalCoachRead` sentences, in order.
    static func read(_ read: GoalRead) -> String {
        var sentences: [String] = []
        switch read.standing {
        case .noMilestones:
            sentences.append(String(localized: "goals.read.none", bundle: .module))
        case .drift(let ahead):
            let percent = read.milestonePercent ?? 0
            sentences.append(
                ahead
                    ? String(localized: "goals.read.ahead \(read.progress) \(percent)", bundle: .module)
                    : String(localized: "goals.read.behind \(read.progress) \(percent)", bundle: .module))
        case .inStep:
            sentences.append(String(localized: "goals.read.inStep \(read.done) \(read.total) \(read.progress)", bundle: .module))
        }
        if let next = read.nextMilestone {
            sentences.append(String(localized: "goals.read.next \(next)", bundle: .module))
        } else if read.total > 0 {
            sentences.append(String(localized: "goals.read.allDone", bundle: .module))
        }
        if read.targetPassed { sentences.append(String(localized: "goals.read.passed", bundle: .module)) }
        return sentences.joined(separator: " ")
    }

    static func loadMessage(_ error: AppError) -> String {
        switch error {
        case .offline: String(localized: "goals.error.offline", bundle: .module)
        case .timeout: String(localized: "goals.error.timeout", bundle: .module)
        case .forbidden(let server), .notFound(let server), .conflict(let server), .server(let server), .validation(let server, _),
            .unauthorized(let server), .rateLimited(let server, _):
            server.text ?? String(localized: "goals.error.generic", bundle: .module)
        case .decoding: String(localized: "goals.error.generic", bundle: .module)
        }
    }
}
