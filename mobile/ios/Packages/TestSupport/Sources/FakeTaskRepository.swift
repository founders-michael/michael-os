import Foundation
import Models
import Repositories
import os

/// Holds a list of tasks and answers as the server would: filtered, paged, saved. A queued failure answers the next
/// call; a held call waits for its gate.
public final class FakeTaskRepository: TaskRepository {
    public enum Call: Equatable, Sendable {
        case list(TaskQuery)
        case task(Task.ID)
        case summary
        case update(Task.ID, TaskUpdate)
        case create(TaskCreate)
        case save(TaskSave, Task.ID?)
        case delete(Task.ID)
        case skip(Task.ID)
    }

    private struct State {
        var tasks: [Task]
        var today: LocalDate?
        var calls: [Call] = []
        var failures: [AppError] = []
        var gate: (@Sendable () async -> Void)?
        var created = 0
    }

    private let lock: OSAllocatedUnfairLock<State>

    /// Without `today` no task counts as overdue.
    public init(tasks: [Task] = [], today: LocalDate? = nil) {
        lock = OSAllocatedUnfairLock(initialState: State(tasks: tasks, today: today))
    }

    public var calls: [Call] { lock.withLock { $0.calls } }

    public var tasks: [Task] { lock.withLock { $0.tasks } }

    public var updates: [TaskUpdate] {
        calls.compactMap { if case .update(_, let change) = $0 { change } else { nil } }
    }

    public var creates: [TaskCreate] {
        calls.compactMap { if case .create(let task) = $0 { task } else { nil } }
    }

    public var lists: [TaskQuery] {
        calls.compactMap { if case .list(let query) = $0 { query } else { nil } }
    }

    /// The next calls fail with these, in order.
    public func fail(with errors: AppError...) { lock.withLock { $0.failures = errors } }

    /// The next call waits for `gate` before answering.
    public func hold(until gate: @escaping @Sendable () async -> Void) { lock.withLock { $0.gate = gate } }

    /// Changes a task as another device would.
    public func replace(_ task: Task) {
        lock.withLock { state in
            if let index = state.tasks.firstIndex(where: { $0.id == task.id }) { state.tasks[index] = task }
        }
    }

    public func remove(_ id: Task.ID) {
        lock.withLock { $0.tasks.removeAll { $0.id == id } }
    }

    public func list(_ query: TaskQuery) async throws -> TaskPage {
        try await answer(.list(query)) { state in
            let term = query.search.trimmingCharacters(in: .whitespaces).lowercased()
            let matching = state.tasks.filter { task in
                let inView =
                    switch query.view {
                    case .all: true
                    case .pending: task.status != .completed
                    case .completed: task.status == .completed
                    case .overdue: task.status != .completed && Self.isOverdue(task, today: state.today)
                    }
                return inView && (query.priority.map { $0 == task.priority } ?? true)
                    && (term.isEmpty || task.title.lowercased().contains(term))
            }
            let size = TaskQuery.pageSize
            let pages = max(1, (matching.count + size - 1) / size)
            let slice = matching.dropFirst((query.page - 1) * size).prefix(size)
            return TaskPage(tasks: Array(slice), page: query.page, limit: size, total: matching.count, pages: pages)
        }
    }

    public func task(_ id: Task.ID) async throws -> Task {
        try await answer(.task(id)) { state in try Self.find(id, in: state) }
    }

    public func summary() async throws -> TaskSummary {
        try await answer(.summary) { state in
            guard let today = state.today else { throw AppError.server(ServerMessage(text: "Pass `today` to the fake.")) }
            let open = state.tasks.filter { $0.status != .completed }
            return TaskSummary(
                dueToday: open.filter { $0.dueDate == today }.count,
                outstanding: open.count,
                completed: state.tasks.count - open.count,
                overdue: open.filter { Self.isOverdue($0, today: state.today) }.count,
                today: today
            )
        }
    }

    public func update(_ id: Task.ID, _ change: TaskUpdate) async throws -> Task {
        try await answer(.update(id, change)) { state in
            let saved = try Self.find(id, in: state).with(status: change.status)
            Self.store(saved, in: &state)
            return saved
        }
    }

    public func create(_ task: TaskCreate) async throws -> Task {
        try await answer(.create(task)) { state in
            state.created += 1
            let created = Task(
                id: "task-\(state.created)", title: task.title, description: task.description, status: .todo,
                priority: task.priority, estimatedDurationMinutes: task.estimatedDurationMinutes,
                remainingDurationMinutes: task.estimatedDurationMinutes, dueDate: task.dueDate, completedAt: nil,
                createdAt: .now, updatedAt: .now
            )
            state.tasks.insert(created, at: 0)
            return created
        }
    }

    public func save(_ save: TaskSave, to id: Task.ID?) async throws -> Task {
        try await answer(.save(save, id)) { state in
            let existing = try id.map { try Self.find($0, in: state) }
            if existing == nil { state.created += 1 }
            let recurrence: TaskRecurrence? =
                switch save.recurrence {
                case .set(let rule):
                    TaskRecurrence(
                        frequency: rule.frequency, interval: rule.interval, weekdays: rule.weekdays, monthDay: rule.monthDay,
                        endsOn: rule.endsOn, active: true, label: "Repeats"
                    )
                case .clear: existing?.recurrence.map { $0.stopped }
                case nil: existing?.recurrence
                }
            let remindAt: Date? =
                switch save.reminder {
                case .set: Date(timeIntervalSince1970: 1_800_000_000)
                case .clear: nil
                case nil: existing?.remindAt
                }
            let saved = Task(
                id: existing?.id ?? "task-\(state.created)", title: save.title, description: save.description,
                status: existing?.status ?? .todo, priority: save.priority,
                estimatedDurationMinutes: save.estimatedDurationMinutes,
                remainingDurationMinutes: save.remainingDurationMinutes, dueDate: save.dueDate,
                completedAt: existing?.completedAt, createdAt: existing?.createdAt ?? .now, updatedAt: .now,
                recurrence: recurrence, remindAt: remindAt, reminderSent: save.reminder == nil && existing?.reminderSent == true
            )
            if existing == nil { state.tasks.insert(saved, at: 0) } else { Self.store(saved, in: &state) }
            return saved
        }
    }

    public func delete(_ id: Task.ID) async throws {
        try await answer(.delete(id)) { state in
            _ = try Self.find(id, in: state)
            state.tasks.removeAll { $0.id == id }
        }
    }

    public func skip(_ id: Task.ID) async throws -> Task {
        try await answer(.skip(id)) { state in
            let task = try Self.find(id, in: state)
            guard task.activeRecurrence != nil else {
                throw AppError.conflict(
                    ServerMessage(text: "This task no longer repeats, so there is no next date to skip to.", code: "SERIES_STOPPED"))
            }
            let skipped = task.moved(to: task.dueDate?.adding(days: 7))
            Self.store(skipped, in: &state)
            return skipped
        }
    }

    private func answer<Value: Sendable>(_ call: Call, _ body: (inout State) throws -> Value) async throws -> Value {
        let gate = lock.withLock { state in
            state.calls.append(call)
            defer { state.gate = nil }
            return state.gate
        }
        if let gate { await gate() }
        return try lock.withLockUnchecked { state in
            if !state.failures.isEmpty { throw state.failures.removeFirst() }
            return try body(&state)
        }
    }

    private static func isOverdue(_ task: Task, today: LocalDate?) -> Bool {
        guard let today, let due = task.dueDate else { return false }
        return due < today
    }

    private static func find(_ id: Task.ID, in state: State) throws -> Task {
        guard let task = state.tasks.first(where: { $0.id == id }) else {
            throw AppError.notFound(ServerMessage(text: "Task not found."))
        }
        return task
    }

    private static func store(_ task: Task, in state: inout State) {
        if let index = state.tasks.firstIndex(where: { $0.id == task.id }) { state.tasks[index] = task }
    }
}

extension TaskRecurrence {
    fileprivate var stopped: TaskRecurrence {
        TaskRecurrence(
            frequency: frequency, interval: interval, weekdays: weekdays, monthDay: monthDay, endsOn: endsOn, active: false,
            label: label)
    }
}

extension Task {
    public func with(status: TaskStatus) -> Task {
        Task(
            id: id, title: title, description: description, status: status, priority: priority,
            estimatedDurationMinutes: estimatedDurationMinutes, remainingDurationMinutes: remainingDurationMinutes,
            dueDate: dueDate, completedAt: status == .completed ? .now : nil, createdAt: createdAt, updatedAt: .now,
            recurrence: recurrence, remindAt: remindAt, reminderSent: reminderSent
        )
    }

    public func moved(to dueDate: LocalDate?) -> Task {
        Task(
            id: id, title: title, description: description, status: status, priority: priority,
            estimatedDurationMinutes: estimatedDurationMinutes, remainingDurationMinutes: remainingDurationMinutes,
            dueDate: dueDate, completedAt: completedAt, createdAt: createdAt, updatedAt: .now, recurrence: recurrence,
            remindAt: remindAt, reminderSent: reminderSent
        )
    }
}
