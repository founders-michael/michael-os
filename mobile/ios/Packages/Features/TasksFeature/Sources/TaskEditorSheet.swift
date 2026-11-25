import DesignSystem
import Models
import SwiftUI

/// Create or edit a task. Closing with unsaved changes asks first; the sheet closes itself once the server has
/// returned the saved task.
struct TaskEditorSheet: View {
    @State private var model: TaskEditorModel
    let onSaved: (Task) -> Void
    @State private var confirmingDiscard = false
    @Environment(\.dismiss) private var dismiss

    init(model: @autoclosure () -> TaskEditorModel, onSaved: @escaping (Task) -> Void) {
        _model = State(initialValue: model())
        self.onSaved = onSaved
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: MichaelSpace.lg) {
                    if let failure = model.failure {
                        ErrorBanner(message: failure.refusal ?? failure.loadMessage)
                    }
                    titleField
                    notesField
                    priorityField
                    dueField
                    minutesField(String(localized: "tasks.editor.estimate", bundle: .module), field: .estimatedDurationMinutes)
                    minutesField(String(localized: "tasks.editor.remaining", bundle: .module), field: .remainingDurationMinutes)
                    RepeatField(model: model)
                    ReminderField(model: model)
                }
                .padding(.horizontal, MichaelSpace.screenGutter)
                .padding(.vertical, MichaelSpace.lg)
            }
            .background(MichaelBackground())
            .navigationTitle(
                model.isNew
                    ? String(localized: "tasks.editor.new", bundle: .module) : String(localized: "tasks.editor.edit", bundle: .module)
            )
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "tasks.editor.cancel", bundle: .module)) {
                        if model.hasChanges { confirmingDiscard = true } else { dismiss() }
                    }
                    .disabled(model.status == .saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if model.status == .saving {
                        ProgressView().accessibilityLabel(String(localized: "tasks.editor.saving", bundle: .module))
                    } else {
                        Button(String(localized: "tasks.editor.save", bundle: .module)) {
                            _Concurrency.Task { await model.save() }
                        }
                        .disabled(!model.canSave)
                    }
                }
            }
            .confirmationDialog(
                String(localized: "tasks.editor.discard.title", bundle: .module),
                isPresented: $confirmingDiscard,
                titleVisibility: .visible
            ) {
                Button(String(localized: "tasks.editor.discard.confirm", bundle: .module), role: .destructive) { dismiss() }
                Button(String(localized: "tasks.editor.discard.keep", bundle: .module), role: .cancel) {}
            }
        }
        .interactiveDismissDisabled(model.hasChanges || model.status == .saving)
        .onChange(of: model.status) { _, status in
            if case .saved(let task) = status {
                onSaved(task)
                dismiss()
            }
        }
        .sensoryFeedback(.success, trigger: model.status) { _, status in if case .saved = status { true } else { false } }
    }

    private var titleField: some View {
        LabeledField(
            label: String(localized: "tasks.editor.title", bundle: .module),
            count: (model.form.title.count, TaskForm.titleLimit),
            message: model.message(for: .title)
        ) {
            TextField("", text: Binding(get: { model.form.title }, set: { value in model.edit { $0.title = value } }), axis: .vertical)
                .accessibilityLabel(String(localized: "tasks.editor.title", bundle: .module))
                .lineLimit(1...3)
                .michaelFieldFrame(model.message(for: .title) == nil ? .plain : .error)
        }
    }

    private var notesField: some View {
        LabeledField(
            label: String(localized: "tasks.editor.notes", bundle: .module),
            count: (model.form.notes.count, TaskForm.notesLimit),
            message: model.message(for: .description)
        ) {
            TextField("", text: Binding(get: { model.form.notes }, set: { value in model.edit { $0.notes = value } }), axis: .vertical)
                .accessibilityLabel(String(localized: "tasks.editor.notes", bundle: .module))
                .lineLimit(3...8)
                .michaelFieldFrame(model.message(for: .description) == nil ? .plain : .error)
        }
    }

    private var priorityField: some View {
        LabeledField(label: String(localized: "tasks.editor.priority", bundle: .module), message: nil) {
            MichaelSegmentedControl(
                selection: Binding(get: { model.form.priority }, set: { value in model.edit { $0.priority = value } }),
                options: [TaskPriority.low, .medium, .high],
                title: TaskFormat.priority
            )
        }
    }

    private var dueField: some View {
        LabeledField(label: String(localized: "tasks.editor.due", bundle: .module), message: model.message(for: .dueDate)) {
            OptionalDateField(
                label: String(localized: "tasks.editor.due", bundle: .module),
                date: Binding(get: { model.form.dueDate }, set: { value in model.edit { $0.dueDate = value } }),
                start: { model.today ?? PickerClock.today(in: model.timeZone) },
                addTitle: String(localized: "tasks.editor.due.add", bundle: .module),
                clearLabel: String(localized: "tasks.editor.due.clear", bundle: .module),
                tone: model.message(for: .dueDate) == nil ? .plain : .error
            )
        }
    }

    private func minutesField(_ label: String, field: TaskForm.Field) -> some View {
        let isEstimate = field == .estimatedDurationMinutes
        return LabeledField(label: label, message: model.message(for: field)) {
            HStack(spacing: MichaelSpace.sm) {
                TextField(
                    "",
                    text: Binding(
                        get: { isEstimate ? model.form.estimate : model.form.remaining },
                        set: { value in model.edit { if isEstimate { $0.estimate = value } else { $0.remaining = value } } }
                    )
                )
                .accessibilityLabel(label)
                .keyboardType(.numberPad)
                .michaelFieldFrame(model.message(for: field) == nil ? .plain : .error)
                Text(String(localized: "tasks.editor.minutesUnit", bundle: .module))
                    .michaelText(.label)
                    .foregroundStyle(Color.michael.muted)
            }
        }
    }
}
