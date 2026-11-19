import DesignSystem
import Models
import SwiftUI

struct SectionTitle: View {
    let text: String

    var body: some View {
        Text(text)
            .michaelText(.heading)
            .foregroundStyle(Color.michael.text)
            .accessibilityAddTraits(.isHeader)
            .padding(.top, MichaelSpace.sm)
    }
}

/// A section the server could not load. The rest of the day is still shown.
struct SectionFailure: View {
    let message: String
    let onRetry: () async -> Void

    var body: some View {
        HStack(spacing: MichaelSpace.sm) {
            Text(message)
                .michaelText(.label)
                .foregroundStyle(Color.michael.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
            MichaelButton(String(localized: "myDay.section.retry", bundle: .module), style: .ghost, size: .small) {
                _Concurrency.Task { await onRetry() }
            }
            .fixedSize()
        }
    }
}

struct TimelineSection: View {
    let day: MyDayContent
    let onOpenCalendar: () -> Void
    let onRetry: () async -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.sm) {
            SectionTitle(text: String(localized: "myDay.timeline.title", bundle: .module))
            if let items = day.myDay.timeline {
                if items.isEmpty {
                    Text(String(localized: "myDay.timeline.clear", bundle: .module))
                        .michaelText(.label)
                        .foregroundStyle(Color.michael.muted)
                } else {
                    ForEach(items) { item in
                        TimelineRow(item: item, status: day.taskStatus(of: item), timeZone: day.myDay.timeZone)
                    }
                }
                if day.myDay.timelineTruncated == true {
                    MichaelButton(
                        String(localized: "myDay.timeline.more", bundle: .module),
                        style: .ghost,
                        size: .small,
                        action: onOpenCalendar
                    )
                }
            } else {
                SectionFailure(message: String(localized: "myDay.timeline.failed", bundle: .module), onRetry: onRetry)
            }
        }
    }
}

private struct TimelineRow: View {
    let item: TimelineItem
    let status: TaskStatus?
    let timeZone: String

    var body: some View {
        HStack(alignment: .top, spacing: MichaelSpace.md) {
            RoundedRectangle(cornerRadius: MichaelRadius.pill)
                .fill(railColor)
                .frame(width: MichaelSpace.xs)
            VStack(alignment: .leading, spacing: MichaelSpace.xs) {
                Text(MyDayFormat.timeRange(item.startAt, item.endAt, in: timeZone))
                    .michaelText(.caption)
                    .monospacedDigit()
                    .foregroundStyle(Color.michael.muted)
                Text(labelText)
                    .michaelText(.caption)
                    .foregroundStyle(Color.michael.faint)
                Text(item.title)
                    .michaelText(.body)
                    .foregroundStyle(Color.michael.text)
                if let description = item.description, !description.isEmpty {
                    Text(description)
                        .michaelText(.label)
                        .foregroundStyle(Color.michael.muted)
                        .lineLimit(3)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(MichaelSpace.md)
        .background(Color.michael.surface, in: RoundedRectangle(cornerRadius: MichaelRadius.stat))
        .overlay { RoundedRectangle(cornerRadius: MichaelRadius.stat).strokeBorder(Color.michael.border) }
        .accessibilityElement(children: .combine)
    }

    private var labelText: String {
        guard let status = status?.label else { return item.label }
        return String(localized: "myDay.timeline.labelWithStatus \(item.label) \(status)", bundle: .module)
    }

    private var railColor: Color {
        switch item.kind {
        case .focus: Color.michael.accent
        case .commitment: Color.michael.accent2
        case .unavailable, .unknown: Color.michael.border2
        }
    }
}

struct TasksSection: View {
    let day: MyDayContent
    let onToggle: (Task.ID) -> Void
    let onRetry: () async -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            SectionTitle(text: String(localized: "myDay.tasks.title", bundle: .module))
            if day.myDay.tasks == nil {
                SectionFailure(message: String(localized: "myDay.tasks.failed", bundle: .module), onRetry: onRetry)
            } else if day.tasks.isEmpty {
                Text(String(localized: "myDay.tasks.none", bundle: .module))
                    .michaelText(.label)
                    .foregroundStyle(Color.michael.muted)
            } else {
                ForEach(day.tasks) { row in
                    TaskRowView(row: row) { onToggle(row.id) }
                }
            }
        }
    }
}

private struct TaskRowView: View {
    let row: MyDayTaskRow
    let onToggle: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: MichaelSpace.sm) {
                MichaelCheck(isChecked: row.isDone, label: checkLabel, action: onToggle)
                    .disabled(!row.canToggle)
                RowText {
                    Text(row.task.title)
                        .michaelText(.body)
                        .strikethrough(row.isDone)
                        .foregroundStyle(row.isDone ? Color.michael.faint : Color.michael.text)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if let chip {
                        chip
                    }
                }
            }
            if let rollback = row.rollback {
                RollbackNotice(message: rollback.message, onRetry: onToggle)
            }
        }
        .animation(.easeOut(duration: MichaelMotion.check), value: row.isDone)
    }

    private var checkLabel: String {
        row.isDone
            ? String(localized: "myDay.task.reopen \(row.task.title)", bundle: .module)
            : String(localized: "myDay.task.complete \(row.task.title)", bundle: .module)
    }

    private var chip: MichaelChip? {
        if row.status == nil { return MichaelChip(String(localized: "myDay.task.statusUnavailable", bundle: .module)) }
        if row.isOverdue { return MichaelChip(String(localized: "myDay.task.overdue", bundle: .module), tone: .danger) }
        if row.status == .inProgress { return MichaelChip(String(localized: "myDay.status.inProgress", bundle: .module)) }
        return nil
    }
}

struct HabitsSection: View {
    let day: MyDayContent
    let onToggle: (Habit.ID) -> Void
    let onRetry: () async -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            SectionTitle(text: String(localized: "myDay.habits.title", bundle: .module))
            if day.myDay.habits == nil {
                SectionFailure(message: String(localized: "myDay.habits.failed", bundle: .module), onRetry: onRetry)
            } else if day.habits.isEmpty {
                Text(String(localized: "myDay.habits.none", bundle: .module))
                    .michaelText(.label)
                    .foregroundStyle(Color.michael.muted)
            } else {
                if day.isReadOnly {
                    Text(String(localized: "myDay.habits.readOnly", bundle: .module))
                        .michaelText(.caption)
                        .foregroundStyle(Color.michael.faint)
                }
                ForEach(day.habits) { row in
                    HabitRowView(row: row) { onToggle(row.id) }
                }
            }
        }
    }
}

private struct HabitRowView: View {
    let row: MyDayHabitRow
    let onToggle: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: MichaelSpace.sm) {
                MichaelCheck(isChecked: row.isDone, label: checkLabel, action: onToggle)
                    .disabled(!row.canToggle)
                RowText {
                    Text(row.habit.title)
                        .michaelText(.body)
                        .foregroundStyle(Color.michael.text)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if row.habit.currentStreak > 0 {
                        Text(String(localized: "myDay.habit.streak \(row.habit.currentStreak)", bundle: .module))
                            .michaelText(.caption)
                            .monospacedDigit()
                            .foregroundStyle(Color.michael.muted)
                    }
                }
            }
            if let rollback = row.rollback {
                RollbackNotice(message: rollback.message, onRetry: onToggle)
            }
        }
    }

    private var checkLabel: String {
        row.isDone
            ? String(localized: "myDay.habit.undo \(row.habit.title)", bundle: .module)
            : String(localized: "myDay.habit.checkIn \(row.habit.title)", bundle: .module)
    }
}

/// A row's title and its chip side by side. At accessibility sizes the chip moves under the title, which
/// would otherwise break mid-word.
private struct RowText<Content: View>: View {
    @ViewBuilder let content: Content
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let layout =
            typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: MichaelSpace.xs))
            : AnyLayout(HStackLayout(spacing: MichaelSpace.sm))
        layout { content }
    }
}

/// A change the server refused: the row is back as it was, and this says so beside it.
private struct RollbackNotice: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: MichaelSpace.sm) {
            Text(message)
                .michaelText(.caption)
                .foregroundStyle(Color.michael.danger)
                .frame(maxWidth: .infinity, alignment: .leading)
            MichaelButton(String(localized: "myDay.rollback.retry", bundle: .module), style: .ghost, size: .small, action: onRetry)
                .fixedSize()
        }
        .padding(.leading, MichaelSize.checkTouch + MichaelSpace.sm)
        .accessibilityElement(children: .contain)
        .onAppear { AccessibilityNotification.Announcement(message).post() }
        .transition(.opacity)
    }
}

extension TaskStatus {
    fileprivate var label: String? {
        switch self {
        case .completed: String(localized: "myDay.status.done", bundle: .module)
        case .inProgress: String(localized: "myDay.status.inProgress", bundle: .module)
        case .todo: String(localized: "myDay.status.pending", bundle: .module)
        case .unknown: nil
        }
    }
}
