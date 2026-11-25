import Foundation
import Models
import Observation
import Repositories

/// One task: its fields, its status, skipping a repeat, deleting.
@MainActor
@Observable
final class TaskDetailModel {
    enum State: Equatable {
        case loading
        case content(TaskDetail)
        /// Deleted elsewhere since the list loaded.
        case notFound
        case failed(AppError)
        /// Deleted here; the screen goes back to the list.
        case deleted
    }

    private(set) var state: State

    let id: Task.ID
    let timeZone: String
    let today: LocalDate?
    private let tasks: any TaskRepository

    init(id: Task.ID, shown: Task?, timeZone: String, today: LocalDate?, tasks: any TaskRepository) {
        self.id = id
        self.timeZone = timeZone
        self.today = today
        self.tasks = tasks
        state = shown.map { .content(TaskDetail(task: $0)) } ?? .loading
    }

    var detail: TaskDetail? {
        if case .content(let detail) = state { return detail }
        return nil
    }

    /// Reads the task fresh; what the list showed stays on screen meanwhile.
    func load() async {
        do {
            let task = try await tasks.task(id)
            if var detail {
                detail.task = task
                state = .content(detail)
            } else {
                state = .content(TaskDetail(task: task))
            }
        } catch is CancellationError {
            return
        } catch AppError.notFound {
            state = .notFound
        } catch {
            if detail == nil { state = .failed(AppError(error)) }
        }
    }

    /// Optimistic: the control moves at once and comes back, with the reason, if the server refuses.
    func setStatus(_ status: TaskStatus) async {
        guard var detail, detail.busy == nil, detail.task.status != status else { return }
        detail.pendingStatus = status
        detail.problem = nil
        detail.busy = .status
        state = .content(detail)
        await perform(.status) { try await self.tasks.update(self.id, TaskUpdate(status: status)) }
    }

    func skip() async {
        guard detail?.busy == nil, detail?.task.activeRecurrence != nil else { return }
        updateDetail {
            $0.busy = .skip
            $0.problem = nil
        }
        await perform(.skip) { try await self.tasks.skip(self.id) }
    }

    func delete() async {
        guard detail?.busy == nil else { return }
        updateDetail {
            $0.busy = .delete
            $0.problem = nil
        }
        do {
            try await tasks.delete(id)
            state = .deleted
        } catch is CancellationError {
            updateDetail { $0.busy = nil }
        } catch AppError.notFound {
            state = .deleted
        } catch {
            updateDetail {
                $0.busy = nil
                $0.problem = TaskDetail.Problem(action: .delete, error: AppError(error))
            }
        }
    }

    /// The editor saved this task.
    func saved(_ task: Task) {
        updateDetail { $0.task = task }
    }

    private func perform(_ action: TaskDetail.Action, _ write: () async throws -> Task) async {
        do {
            let saved = try await write()
            updateDetail {
                $0.task = saved
                $0.pendingStatus = nil
                $0.busy = nil
            }
        } catch is CancellationError {
            updateDetail {
                $0.pendingStatus = nil
                $0.busy = nil
            }
        } catch AppError.notFound {
            state = .notFound
        } catch {
            updateDetail {
                $0.pendingStatus = nil
                $0.busy = nil
                $0.problem = TaskDetail.Problem(action: action, error: AppError(error))
            }
        }
    }

    private func updateDetail(_ change: (inout TaskDetail) -> Void) {
        guard var detail else { return }
        change(&detail)
        state = .content(detail)
    }
}

struct TaskDetail: Equatable {
    enum Action: Equatable {
        case status, skip, delete
    }

    struct Problem: Equatable {
        let action: Action
        let error: AppError
    }

    var task: Task
    var pendingStatus: TaskStatus?
    var busy: Action?
    var problem: Problem?

    init(task: Task) {
        self.task = task
    }

    var status: TaskStatus { pendingStatus ?? task.status }
}
