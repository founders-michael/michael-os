import Foundation
import Models

/// A loaded day as the screen shows it: the server's answer, plus the writes still in flight and the ones the
/// server refused. Rows are derived, never stored.
public struct MyDayContent: Equatable {
    public private(set) var myDay: MyDay
    public private(set) var loadedAt: Date
    public internal(set) var isRefreshing = false
    /// A refresh failed while this data stayed on screen.
    public internal(set) var refreshProblem: AppError?
    /// Keyed by task or habit ID.
    public internal(set) var rollbacks: [String: MyDayRollback] = [:]
    var pendingTasks: [Task.ID: TaskStatus] = [:]
    var pendingHabits: [Habit.ID: Bool] = [:]

    init(myDay: MyDay, loadedAt: Date) {
        self.myDay = myDay
        self.loadedAt = loadedAt
    }

    public var isToday: Bool { myDay.selectedDate == myDay.today }

    /// Writes are only for today. Another date shows what was true on it.
    public var isReadOnly: Bool { !isToday }

    /// Today also lists overdue tasks, which need a decision even though nothing happened to them today. Tasks
    /// due before today come first, by due date alone, so completing one does not move its row.
    public var tasks: [MyDayTaskRow] {
        guard let section = myDay.tasks else { return [] }
        var seen = Set<Task.ID>()
        var rows: [MyDayTaskRow] = []
        if isToday {
            for item in section.sections.overdue where seen.insert(item.task.id).inserted {
                rows.append(taskRow(item.task, status: item.task.status))
            }
        }
        for entry in section.dailyTasks where seen.insert(entry.task.id).inserted {
            rows.append(taskRow(entry.task, status: entry.statusAtSelectedDate ?? (isToday ? entry.task.status : nil)))
        }
        let today = myDay.today
        let pastDue = rows.filter { $0.task.dueDate.map { $0 < today } ?? false }
        return pastDue + rows.filter { row in !pastDue.contains { $0.id == row.id } }
    }

    public var habits: [MyDayHabitRow] {
        guard let section = myDay.habits else { return [] }
        return section.habits.map { habit in
            let pending = pendingHabits[habit.id]
            let done =
                isToday
                ? pending ?? habit.completedToday
                : habit.checkIns.contains { $0.localDate == myDay.selectedDate }
            return MyDayHabitRow(
                habit: habit,
                isDone: done,
                isSaving: pending != nil,
                canToggle: isToday && pending == nil && habit.status == .active,
                rollback: rollbacks[habit.id]
            )
        }
    }

    var isEmpty: Bool {
        guard let timeline = myDay.timeline, myDay.tasks != nil, myDay.habits != nil else { return false }
        return tasks.isEmpty && habits.isEmpty && timeline.isEmpty
    }

    /// The first timeline item that has not ended yet, on today only.
    public func nextItem(at now: Date) -> TimelineItem? {
        guard isToday else { return nil }
        return myDay.timeline?.first { $0.endAt > now }
    }

    /// The status on the selected date of the task a timeline item belongs to.
    public func taskStatus(of item: TimelineItem) -> TaskStatus? {
        guard let taskID = item.taskId else { return nil }
        return myDay.tasks?.dailyTasks.first { $0.task.id == taskID }?.statusAtSelectedDate
    }

    private func taskRow(_ task: Task, status: TaskStatus?) -> MyDayTaskRow {
        let pending = pendingTasks[task.id]
        let shown = pending ?? status
        let overdue = task.dueDate.map { $0 < myDay.today } ?? false
        return MyDayTaskRow(
            task: task,
            status: shown,
            isOverdue: overdue && shown != .completed,
            isSaving: pending != nil,
            canToggle: isToday && pending == nil && shown != nil && shown != .unknown,
            rollback: rollbacks[task.id]
        )
    }

    mutating func replace(with fresh: MyDay, at time: Date) {
        if fresh.selectedDate != myDay.selectedDate {
            rollbacks = [:]
        }
        myDay = fresh
        loadedAt = time
        isRefreshing = false
        refreshProblem = nil
    }

    /// The task as the server saved it. Its status today is its current status.
    mutating func apply(_ saved: Task) {
        pendingTasks[saved.id] = nil
        guard var section = myDay.tasks else { return }
        for index in section.dailyTasks.indices where section.dailyTasks[index].task.id == saved.id {
            section.dailyTasks[index].task = saved
            if isToday { section.dailyTasks[index].statusAtSelectedDate = saved.status }
        }
        section.sections.replace(saved)
        myDay.tasks = section
    }

    mutating func applyCheckIn(_ checkIn: HabitCheckIn, habit id: Habit.ID) {
        pendingHabits[id] = nil
        updateHabit(id) { habit in
            habit.completedToday = true
            if !habit.checkIns.contains(where: { $0.id == checkIn.id }) {
                habit.checkIns.insert(checkIn, at: 0)
            }
        }
    }

    mutating func removeCheckIn(_ checkInID: HabitCheckIn.ID, habit id: Habit.ID) {
        pendingHabits[id] = nil
        updateHabit(id) { habit in
            habit.completedToday = false
            habit.checkIns.removeAll { $0.id == checkInID }
        }
    }

    private mutating func updateHabit(_ id: Habit.ID, _ change: (inout Habit) -> Void) {
        guard var section = myDay.habits, let index = section.habits.firstIndex(where: { $0.id == id }) else { return }
        change(&section.habits[index])
        myDay.habits = section
    }
}

public struct MyDayTaskRow: Equatable, Identifiable {
    public let task: Task
    /// Nil when the task's status on a past date cannot be reconstructed.
    public let status: TaskStatus?
    public let isOverdue: Bool
    /// A change the user made is waiting for the server.
    public let isSaving: Bool
    public let canToggle: Bool
    public let rollback: MyDayRollback?

    public var id: Task.ID { task.id }
    public var isDone: Bool { status == .completed }
}

public struct MyDayHabitRow: Equatable, Identifiable {
    public let habit: Habit
    public let isDone: Bool
    public let isSaving: Bool
    public let canToggle: Bool
    public let rollback: MyDayRollback?

    public var id: Habit.ID { habit.id }
}

/// A change shown on screen that the server refused, so the row went back to what it was.
public struct MyDayRollback: Equatable {
    public enum Action: Equatable {
        case complete, reopen, checkIn, undoCheckIn
    }

    public let action: Action
    public let error: AppError
}

extension TaskSections {
    fileprivate mutating func replace(_ task: Task) {
        for path in [\TaskSections.today, \.overdue, \.upcoming, \.backlog, \.completed] as [WritableKeyPath<TaskSections, [SectionTask]>] {
            for index in self[keyPath: path].indices where self[keyPath: path][index].task.id == task.id {
                self[keyPath: path][index].task = task
            }
        }
    }
}
