import DesignSystem
import Models
import Repositories
import SwiftUI

struct TaskDetailScreen: View {
    @State private var model: TaskDetailModel
    let tasks: any TaskRepository
    let onSaved: (Task) -> Void
    let onDeleted: () -> Void
    @State private var editing: Task?
    @State private var confirmingDelete = false
    @Environment(\.dismiss) private var dismiss

    init(
        model: @autoclosure () -> TaskDetailModel, tasks: any TaskRepository, onSaved: @escaping (Task) -> Void,
        onDeleted: @escaping () -> Void
    ) {
        _model = State(initialValue: model())
        self.tasks = tasks
        self.onSaved = onSaved
        self.onDeleted = onDeleted
    }

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MichaelBackground())
            .navigationTitle(String(localized: "tasks.detail.title", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if let detail = model.detail {
                    ToolbarItem(placement: .primaryAction) {
                        Button(String(localized: "tasks.detail.edit", bundle: .module)) { editing = detail.task }
                            .disabled(detail.busy != nil)
                    }
                }
            }
            .task { await model.load() }
            .onChange(of: model.state) { _, state in
                if state == .deleted {
                    onDeleted()
                    dismiss()
                }
            }
            .sheet(item: $editing) { task in
                TaskEditorSheet(model: TaskEditorModel(task: task, timeZone: model.timeZone, today: model.today, tasks: tasks)) { saved in
                    model.saved(saved)
                    onSaved(saved)
                }
            }
            .sensoryFeedback(.warning, trigger: model.detail?.problem) { _, problem in problem != nil }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            ProgressView()
                .accessibilityLabel(String(localized: "tasks.loading", bundle: .module))
        case .failed(let error):
            FailureStateView(message: error.loadMessage) {
                _Concurrency.Task { await model.load() }
            }
        case .notFound, .deleted:
            EmptyStateView(
                title: String(localized: "tasks.detail.gone.title", bundle: .module),
                message: String(localized: "tasks.detail.gone.message", bundle: .module),
                actionTitle: String(localized: "tasks.detail.gone.action", bundle: .module)
            ) {
                onDeleted()
                dismiss()
            }
        case .content(let detail):
            ScrollView {
                details(detail)
                    .padding(.horizontal, MichaelSpace.screenGutter)
                    .padding(.bottom, MichaelSpace.xl)
            }
        }
    }

    private func details(_ detail: TaskDetail) -> some View {
        VStack(alignment: .leading, spacing: MichaelSpace.lg) {
            heading(detail)
            if let problem = detail.problem {
                ErrorBanner(message: TaskDetailScreen.message(problem))
            }
            fields(detail.task)
            actions(detail)
        }
    }

    @ViewBuilder private func heading(_ detail: TaskDetail) -> some View {
        let task = detail.task
        HStack(spacing: MichaelSpace.sm) {
            MichaelChip(TaskFormat.due(task, today: model.today), tone: TaskFormat.isOverdue(task, today: model.today) ? .warn : .plain)
            MichaelChip(TaskFormat.priority(task.priority), tone: task.priority == .high ? .warn : .plain)
        }
        Text(task.title)
            .michaelText(.display)
            .foregroundStyle(Color.michael.text)
            .accessibilityAddTraits(.isHeader)
        if let notes = task.description {
            Text(notes)
                .michaelText(.body)
                .foregroundStyle(Color.michael.muted)
                .textSelection(.enabled)
        }
        VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            Text(String(localized: "tasks.detail.status", bundle: .module))
                .michaelText(.label)
                .foregroundStyle(Color.michael.muted)
            MichaelSegmentedControl(
                selection: Binding(get: { detail.status }, set: { status in _Concurrency.Task { await model.setStatus(status) } }),
                options: [TaskStatus.todo, .inProgress, .completed],
                title: TaskFormat.status
            )
            .disabled(detail.busy != nil)
        }
    }

    private func fields(_ task: Task) -> some View {
        MichaelCard {
            VStack(alignment: .leading, spacing: MichaelSpace.md) {
                row(
                    String(localized: "tasks.detail.due", bundle: .module),
                    task.dueDate.map(TaskFormat.longDate) ?? String(localized: "tasks.due.none", bundle: .module))
                row(
                    String(localized: "tasks.detail.estimate", bundle: .module),
                    task.estimatedDurationMinutes.map(TaskFormat.minutes) ?? String(localized: "tasks.detail.notSet", bundle: .module))
                row(
                    String(localized: "tasks.detail.remaining", bundle: .module),
                    task.remainingDurationMinutes.map(TaskFormat.minutes) ?? String(localized: "tasks.detail.notSet", bundle: .module))
                if let recurrence = task.activeRecurrence {
                    row(String(localized: "tasks.detail.repeats", bundle: .module), recurrence.label)
                }
                if let remindAt = task.pendingReminder {
                    row(
                        String(localized: "tasks.detail.reminder", bundle: .module),
                        TaskFormat.reminder(remindAt, in: TaskFormat.zone(model.timeZone)))
                } else if task.remindAt != nil, task.reminderSent {
                    row(
                        String(localized: "tasks.detail.reminder", bundle: .module),
                        String(localized: "tasks.detail.reminderSent", bundle: .module))
                }
            }
        }
    }

    @ViewBuilder private func actions(_ detail: TaskDetail) -> some View {
        let task = detail.task
        if task.activeRecurrence != nil, detail.status != .completed {
            VStack(alignment: .leading, spacing: MichaelSpace.xs) {
                MichaelButton(String(localized: "tasks.detail.skip", bundle: .module), style: .secondary) {
                    _Concurrency.Task { await model.skip() }
                }
                .disabled(detail.busy != nil)
                Text(String(localized: "tasks.detail.skipHint", bundle: .module))
                    .michaelText(.caption)
                    .foregroundStyle(Color.michael.muted)
            }
        }
        MichaelButton(String(localized: "tasks.detail.delete", bundle: .module), style: .ghost) { confirmingDelete = true }
            .foregroundStyle(Color.michael.danger)
            .disabled(detail.busy != nil)
            .confirmationDialog(
                String(localized: "tasks.delete.title", bundle: .module),
                isPresented: $confirmingDelete,
                titleVisibility: .visible
            ) {
                Button(String(localized: "tasks.delete.confirm", bundle: .module), role: .destructive) {
                    _Concurrency.Task { await model.delete() }
                }
            } message: {
                Text(
                    task.activeRecurrence == nil
                        ? String(localized: "tasks.delete.message", bundle: .module)
                        : String(localized: "tasks.delete.message.repeating", bundle: .module)
                )
            }
    }

    private func row(_ label: String, _ value: String) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline) {
                Text(label).foregroundStyle(Color.michael.muted)
                Spacer(minLength: MichaelSpace.md)
                Text(value).foregroundStyle(Color.michael.text).multilineTextAlignment(.trailing)
            }
            VStack(alignment: .leading, spacing: MichaelSpace.xs) {
                Text(label).foregroundStyle(Color.michael.muted)
                Text(value).foregroundStyle(Color.michael.text)
            }
        }
        .michaelText(.body)
        .accessibilityElement(children: .combine)
    }

    static func message(_ problem: TaskDetail.Problem) -> String {
        let fallback =
            switch problem.action {
            case .status: String(localized: "tasks.detail.problem.status", bundle: .module)
            case .skip: String(localized: "tasks.detail.problem.skip", bundle: .module)
            case .delete: String(localized: "tasks.detail.problem.delete", bundle: .module)
            }
        guard let reason = problem.error.refusal else { return fallback }
        return String(localized: "tasks.rollback.reason \(fallback) \(reason)", bundle: .module)
    }
}
