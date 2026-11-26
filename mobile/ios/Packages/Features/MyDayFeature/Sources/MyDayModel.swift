import Foundation
import Models
import Observation
import Repositories

@MainActor
@Observable
public final class MyDayModel {
    public enum State: Equatable {
        case loading
        case content(MyDayContent)
        /// No tasks, no habits and nothing on the calendar for the date: one empty state, not three.
        case empty(MyDayContent)
        case failed(AppError)
    }

    public private(set) var state: State = .loading
    /// The date asked for. Nil follows the server's today, so the first refresh after midnight moves to the new day.
    public private(set) var requestedDate: LocalDate?

    static let staleAfter: TimeInterval = 60

    private let days: any MyDayRepository
    private let tasks: any TaskRepository
    private let habits: any HabitRepository
    private let now: () -> Date
    private var readGeneration = 0
    private var seenVersion: Int?

    public init(
        days: any MyDayRepository,
        tasks: any TaskRepository,
        habits: any HabitRepository,
        requestedDate: LocalDate? = nil,
        now: @escaping () -> Date = Date.init
    ) {
        self.days = days
        self.tasks = tasks
        self.habits = habits
        self.requestedDate = requestedDate
        self.now = now
    }

    public var day: MyDayContent? {
        switch state {
        case .content(let day), .empty(let day): day
        case .loading, .failed: nil
        }
    }

    /// The screen appeared, the app returned to the foreground, or another screen changed a task (`version`).
    public func appear(version: Int = 0) async {
        defer { seenVersion = version }
        switch state {
        case .loading, .failed:
            await load()
        case .content(let day), .empty(let day):
            if seenVersion != version || now().timeIntervalSince(day.loadedAt) >= Self.staleAfter {
                await refresh()
            }
        }
    }

    /// A first load, or a retry after a failure with nothing on screen.
    public func load() async {
        state = .loading
        let date = requestedDate
        guard let result = await read(date) else { return }
        switch result {
        case .success(let myDay): show(MyDayContent(myDay: myDay, loadedAt: now()))
        case .failure(let error): state = .failed(error)
        }
    }

    /// Reloads over what is shown. A failure keeps the data on screen and says why.
    public func refresh() async {
        guard var day else {
            await load()
            return
        }
        day.isRefreshing = true
        show(day)
        guard let result = await read(requestedDate) else {
            updateDay { $0.isRefreshing = false }
            return
        }
        switch result {
        case .success(let myDay):
            updateDay { $0.replace(with: myDay, at: now()) }
        case .failure(let error):
            updateDay {
                $0.isRefreshing = false
                $0.refreshProblem = error
            }
        }
    }

    /// Moves to another date. The screen's task for the new date does the load.
    public func step(by days: Int) {
        guard let day else { return }
        showDate(day.myDay.selectedDate.adding(days: days), today: day.myDay.today)
    }

    public func showToday() {
        guard requestedDate != nil else { return }
        requestedDate = nil
        state = .loading
    }

    /// Completes an open task or reopens a completed one, on screen first. True when the server saved it.
    @discardableResult
    public func toggleTask(_ id: Task.ID) async -> Bool {
        guard let day, let row = day.tasks.first(where: { $0.id == id }), row.canToggle, let status = row.status else { return false }
        let target: TaskStatus = status == .completed ? .todo : .completed
        let selectedDate = day.myDay.selectedDate
        updateDay {
            $0.pendingTasks[id] = target
            $0.rollbacks[id] = nil
        }
        do {
            let saved = try await tasks.update(id, TaskUpdate(status: target))
            updateDay(on: selectedDate) { $0.apply(saved) }
            await refreshInPlace(on: selectedDate)
            return true
        } catch is CancellationError {
            updateDay(on: selectedDate) { $0.pendingTasks[id] = nil }
        } catch {
            updateDay(on: selectedDate) { day in
                guard day.pendingTasks[id] == target else { return }
                day.pendingTasks[id] = nil
                day.rollbacks[id] = MyDayRollback(action: target == .completed ? .complete : .reopen, error: AppError(error))
            }
        }
        return false
    }

    /// Checks in a habit for today, or undoes today's check-in, on screen first.
    public func toggleHabit(_ id: Habit.ID) async {
        guard let day, let row = day.habits.first(where: { $0.id == id }), row.canToggle else { return }
        let target = !row.isDone
        let today = day.myDay.today
        let checkIn = row.habit.checkIns.first { $0.localDate == today }
        if !target && checkIn == nil {
            await refreshInPlace(on: today)
            return
        }
        updateDay {
            $0.pendingHabits[id] = target
            $0.rollbacks[id] = nil
        }
        do {
            if target {
                let response = try await habits.checkIn(id, on: today)
                updateDay(on: today) { $0.applyCheckIn(response.checkIn, habit: id) }
            } else if let checkIn {
                try await undo(checkIn, of: id, on: today)
            }
            await refreshInPlace(on: today)
        } catch is CancellationError {
            updateDay(on: today) { $0.pendingHabits[id] = nil }
        } catch {
            updateDay(on: today) { day in
                guard day.pendingHabits[id] == target else { return }
                day.pendingHabits[id] = nil
                day.rollbacks[id] = MyDayRollback(action: target ? .checkIn : .undoCheckIn, error: AppError(error))
            }
        }
    }

    private func undo(_ checkIn: HabitCheckIn, of habit: Habit.ID, on today: LocalDate) async throws {
        do {
            try await habits.undoCheckIn(habit, checkInID: checkIn.id)
        } catch AppError.notFound {
            // Undone elsewhere already: the screen now agrees with the server.
        }
        updateDay(on: today) { $0.removeCheckIn(checkIn.id, habit: habit) }
    }

    private func showDate(_ date: LocalDate, today: LocalDate) {
        requestedDate = date == today ? nil : date
        state = .loading
    }

    /// After a write: brings the server's counts and statuses in without showing a refresh.
    private func refreshInPlace(on selectedDate: LocalDate) async {
        guard day?.myDay.selectedDate == selectedDate, let result = await read(requestedDate),
            case .success(let myDay) = result
        else { return }
        updateDay(on: selectedDate) { $0.replace(with: myDay, at: now()) }
    }

    /// Nil when cancelled or overtaken by a newer read.
    private func read(_ date: LocalDate?) async -> Result<MyDay, AppError>? {
        readGeneration += 1
        let generation = readGeneration
        do {
            let myDay = try await days.day(date)
            return generation == readGeneration ? .success(myDay) : nil
        } catch is CancellationError {
            return nil
        } catch {
            return generation == readGeneration ? .failure(AppError(error)) : nil
        }
    }

    private func show(_ day: MyDayContent) {
        state = day.isEmpty ? .empty(day) : .content(day)
    }

    private func updateDay(on selectedDate: LocalDate? = nil, _ change: (inout MyDayContent) -> Void) {
        guard var day, selectedDate == nil || day.myDay.selectedDate == selectedDate else { return }
        change(&day)
        show(day)
    }
}

extension AppError {
    init(_ error: any Error) {
        self = error as? AppError ?? .server(ServerMessage())
    }
}
