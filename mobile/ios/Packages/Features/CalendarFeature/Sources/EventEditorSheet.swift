import DesignSystem
import Models
import SwiftUI

/// Create or edit an event. Closing with unsaved changes asks first; the sheet closes once the server has the change.
struct EventEditorSheet: View {
    @State private var model: EventEditorModel
    let onDone: () -> Void
    @State private var confirmingDiscard = false
    @State private var confirmingDelete = false
    @Environment(\.dismiss) private var dismiss

    init(model: @autoclosure () -> EventEditorModel, onDone: @escaping () -> Void) {
        _model = State(initialValue: model())
        self.onDone = onDone
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: MichaelSpace.lg) {
                    if !model.conflicts.isEmpty { conflictBanner }
                    if let failure = model.failure { ErrorBanner(message: CalendarFormat.message(failure)) }
                    MichaelTextField(
                        String(localized: "calendar.editor.title", bundle: .module),
                        text: $model.form.title,
                        error: model.serverErrors["title"]
                            ?? (model.showsProblems && model.form.problems.contains(.titleMissing)
                                ? String(localized: "calendar.editor.problem.title", bundle: .module) : nil)
                    )
                    kind
                    if model.form.kind == .session { task }
                    when
                    notes
                    if model.event != nil {
                        MichaelButton(String(localized: "calendar.editor.delete", bundle: .module), style: .destructive) {
                            confirmingDelete = true
                        }
                    }
                }
                .padding(MichaelSpace.screenGutter)
            }
            .background(MichaelBackground())
            .navigationTitle(
                model.event == nil
                    ? String(localized: "calendar.editor.new", bundle: .module) : String(localized: "calendar.editor.edit", bundle: .module)
            )
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "calendar.editor.cancel", bundle: .module)) {
                        if model.hasChanges { confirmingDiscard = true } else { dismiss() }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if model.busy {
                        ProgressView()
                    } else {
                        Button(String(localized: "calendar.editor.save", bundle: .module)) { _Concurrency.Task { await model.save() } }
                    }
                }
            }
            .confirmationDialog(
                String(localized: "calendar.editor.discard", bundle: .module), isPresented: $confirmingDiscard, titleVisibility: .visible
            ) {
                Button(String(localized: "calendar.editor.discard.confirm", bundle: .module), role: .destructive) { dismiss() }
            }
            .confirmationDialog(
                String(localized: "calendar.editor.delete.title", bundle: .module), isPresented: $confirmingDelete,
                titleVisibility: .visible
            ) {
                Button(String(localized: "calendar.editor.delete.confirm", bundle: .module), role: .destructive) {
                    _Concurrency.Task { await model.delete() }
                }
            } message: {
                Text(
                    model.form.kind == .session
                        ? String(localized: "calendar.editor.delete.session", bundle: .module)
                        : String(localized: "calendar.editor.delete.message", bundle: .module)
                )
            }
        }
        .interactiveDismissDisabled(model.hasChanges || model.busy)
        .onChange(of: model.done) { _, done in
            if done {
                onDone()
                dismiss()
            }
        }
    }

    private var conflictBanner: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            Text(String(localized: "calendar.editor.conflict", bundle: .module)).michaelText(.label)
            ForEach(model.conflicts, id: \.eventId) { conflict in
                Text("\(conflict.title), \(CalendarFormat.range(conflict.startAt, conflict.endAt, model.clock))")
                    .michaelText(.caption)
                    .monospacedDigit()
            }
            Text(String(localized: "calendar.editor.conflict.help", bundle: .module)).michaelText(.caption)
        }
        .foregroundStyle(Color.michael.danger)
        .padding(MichaelSpace.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.michael.dangerBg, in: RoundedRectangle(cornerRadius: MichaelRadius.stat))
        .accessibilityElement(children: .combine)
    }

    private var kind: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            Text(String(localized: "calendar.editor.type", bundle: .module)).michaelText(.label).foregroundStyle(Color.michael.muted)
            if model.event == nil {
                MichaelSegmentedControl(selection: $model.form.kind, options: EventKind.allCases, title: CalendarFormat.kind)
            } else {
                Text(CalendarFormat.kind(model.form.kind)).michaelText(.body).foregroundStyle(Color.michael.text)
            }
            Text(CalendarFormat.kindHelp(model.form.kind)).michaelText(.caption).foregroundStyle(Color.michael.faint)
        }
    }

    private var task: some View {
        let options = taskOptions
        return VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            Text(String(localized: "calendar.editor.task", bundle: .module)).michaelText(.label).foregroundStyle(Color.michael.muted)
            Menu {
                Button(String(localized: "calendar.editor.task.none", bundle: .module)) {
                    model.form.taskId = nil
                    model.form.taskTitle = nil
                }
                ForEach(options, id: \.id) { option in
                    Button(option.title) {
                        model.form.taskId = option.id
                        model.form.taskTitle = option.title
                        if model.form.title.trimmingCharacters(in: .whitespaces).isEmpty {
                            model.form.title = String(option.title.prefix(EventForm.titleLimit))
                        }
                    }
                }
            } label: {
                HStack {
                    Text(model.form.taskTitle ?? String(localized: "calendar.editor.task.none", bundle: .module))
                        .michaelText(.body)
                        .foregroundStyle(model.form.taskTitle == nil ? Color.michael.faint : Color.michael.text)
                        .lineLimit(1)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down").foregroundStyle(Color.michael.faint).accessibilityHidden(true)
                }
                .michaelFieldFrame()
            }
            .accessibilityLabel(String(localized: "calendar.editor.task", bundle: .module))
            .accessibilityValue(model.form.taskTitle ?? String(localized: "calendar.editor.task.none", bundle: .module))
        }
    }

    private var taskOptions: [(id: String, title: String)] {
        var options = model.tasks.map { (id: $0.id, title: $0.title) }
        if let id = model.form.taskId, let title = model.form.taskTitle, !options.contains(where: { $0.id == id }) {
            options.insert((id, title), at: 0)
        }
        return options
    }

    private var when: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.sm) {
            DatePicker(
                String(localized: "calendar.editor.date", bundle: .module),
                selection: Binding(get: { PickerClock.date(model.form.date) }, set: { model.form.date = PickerClock.localDate($0) }),
                displayedComponents: .date
            )
            .environment(\.timeZone, PickerClock.timeZone)
            .michaelText(.body)
            .foregroundStyle(Color.michael.text)
            .michaelFieldFrame()
            timeRow(String(localized: "calendar.editor.starts", bundle: .module), time: $model.form.start)
            timeRow(String(localized: "calendar.editor.ends", bundle: .module), time: $model.form.end)
            if model.showsProblems && model.form.problems.contains(.noLength) {
                Text(String(localized: "calendar.editor.problem.length", bundle: .module)).michaelText(.caption).foregroundStyle(
                    Color.michael.danger)
            } else if let error = model.serverErrors["endAt"] ?? model.serverErrors["startAt"] {
                Text(error).michaelText(.caption).foregroundStyle(Color.michael.danger)
            } else if model.form.endsNextDay {
                Text(String(localized: "calendar.editor.nextDay", bundle: .module)).michaelText(.caption).foregroundStyle(
                    Color.michael.muted)
            }
            Text(String(localized: "calendar.editor.zone \(model.clock.zone)", bundle: .module)).michaelText(.caption).foregroundStyle(
                Color.michael.faint)
        }
    }

    private func timeRow(_ label: String, time: Binding<LocalTime>) -> some View {
        DatePicker(
            label,
            selection: Binding(get: { PickerClock.date(time.wrappedValue) }, set: { time.wrappedValue = PickerClock.localTime($0) }),
            displayedComponents: .hourAndMinute
        )
        .environment(\.timeZone, PickerClock.timeZone)
        .michaelText(.body)
        .foregroundStyle(Color.michael.text)
        .michaelFieldFrame(!model.conflicts.isEmpty ? .error : .plain)
    }

    private var notes: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            Text(String(localized: "calendar.editor.notes", bundle: .module)).michaelText(.label).foregroundStyle(Color.michael.muted)
            TextField("", text: $model.form.notes, axis: .vertical)
                .lineLimit(2...6)
                .accessibilityLabel(String(localized: "calendar.editor.notes", bundle: .module))
                .michaelFieldFrame()
        }
    }
}
