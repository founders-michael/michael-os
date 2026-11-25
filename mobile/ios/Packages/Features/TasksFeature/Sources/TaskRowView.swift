import DesignSystem
import Models
import SwiftUI

/// One task in the list: the check, the title and what is known about it. The row opens the task.
struct TaskRowView: View {
    let task: Task
    let status: TaskStatus
    let today: LocalDate?
    let timeZone: TimeZone
    let rollback: TaskRollback?
    let onToggle: () -> Void
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            HStack(alignment: .top, spacing: MichaelSpace.md) {
                MichaelCheck(isChecked: status == .completed, label: checkLabel, action: onToggle)
                VStack(alignment: .leading, spacing: MichaelSpace.xs) {
                    Text(task.title)
                        .michaelText(.body)
                        .foregroundStyle(status == .completed ? Color.michael.muted : Color.michael.text)
                        .strikethrough(status == .completed, color: Color.michael.faint)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    meta
                }
                Image(systemName: "chevron.right")
                    .foregroundStyle(Color.michael.faint)
                    .padding(.top, MichaelSpace.xs)
                    .accessibilityHidden(true)
            }
            if let rollback {
                Text(TaskRowView.message(rollback))
                    .michaelText(.caption)
                    .foregroundStyle(Color.michael.danger)
                    .padding(.leading, MichaelSize.checkTouch + MichaelSpace.md)
            }
        }
        .padding(.vertical, MichaelSpace.sm)
        .frame(minHeight: MichaelSize.field + MichaelSpace.lg, alignment: .leading)
        .overlay(alignment: .bottom) { Divider().overlay(Color.michael.border) }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityAction(named: checkLabel, onToggle)
    }

    private var meta: some View {
        let layout =
            typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: MichaelSpace.xs))
            : AnyLayout(HStackLayout(spacing: MichaelSpace.sm))
        return VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            layout {
                Text(TaskFormat.due(task, today: today))
                    .foregroundStyle(TaskFormat.isOverdue(task, today: today) ? Color.michael.warn : Color.michael.muted)
                Text(TaskFormat.priority(task.priority))
                if let minutes = task.estimatedDurationMinutes {
                    Text(TaskFormat.minutes(minutes))
                        .monospacedDigit()
                }
                if status == .inProgress {
                    MichaelChip(TaskFormat.status(.inProgress), tone: .ai)
                }
            }
            if let recurrence = task.activeRecurrence {
                Label(recurrence.label, systemImage: "repeat")
            }
            if let remindAt = task.pendingReminder {
                Label(TaskFormat.reminder(remindAt, in: timeZone), systemImage: "bell")
            }
        }
        .michaelText(.caption)
        .foregroundStyle(Color.michael.muted)
    }

    private var checkLabel: String {
        status == .completed
            ? String(localized: "tasks.row.reopen \(task.title)", bundle: .module)
            : String(localized: "tasks.row.complete \(task.title)", bundle: .module)
    }

    static func message(_ rollback: TaskRollback) -> String {
        let fallback =
            rollback.completing
            ? String(localized: "tasks.rollback.complete", bundle: .module)
            : String(localized: "tasks.rollback.reopen", bundle: .module)
        guard let reason = rollback.error.refusal else { return fallback }
        return String(localized: "tasks.rollback.reason \(fallback) \(reason)", bundle: .module)
    }
}
