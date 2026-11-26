import Foundation
import Models
import Repositories
import os

/// The day from `my-day.json`: three tasks, one habit already checked in, no timeline, today 2026-11-17.
public enum MyDayExamples {
    public static func day() throws -> MyDay {
        try JSONDecoder.api().decode(MyDay.self, from: try ContractExamples.example("my-day.json"))
    }
}

/// Answers with `day` unless a failure is queued. A held call waits for its gate before answering.
public final class FakeMyDayRepository: MyDayRepository {
    private struct State {
        var day: MyDay
        var requests: [LocalDate?] = []
        var failures: [AppError] = []
        var gate: (@Sendable () async -> Void)?
    }

    private let lock: OSAllocatedUnfairLock<State>

    public init(day: MyDay) {
        lock = OSAllocatedUnfairLock(initialState: State(day: day))
    }

    public var day: MyDay {
        get { lock.withLock { $0.day } }
        set { lock.withLock { $0.day = newValue } }
    }

    /// The date each call asked for; nil asked for the server's today.
    public var requests: [LocalDate?] { lock.withLock { $0.requests } }

    /// The next calls fail with these, in order.
    public func fail(with errors: AppError...) { lock.withLock { $0.failures = errors } }

    public func hold(until gate: @escaping @Sendable () async -> Void) { lock.withLock { $0.gate = gate } }

    public func day(_ date: LocalDate?) async throws -> MyDay {
        let gate = lock.withLock { state in
            state.requests.append(date)
            defer { state.gate = nil }
            return state.gate
        }
        if let gate { await gate() }
        return try lock.withLock { state in
            if !state.failures.isEmpty { throw state.failures.removeFirst() }
            return state.day
        }
    }
}

public final class FakeHabitRepository: HabitRepository {
    public enum Call: Equatable, Sendable {
        case checkIn(habit: Habit.ID, date: LocalDate)
        case undo(habit: Habit.ID, checkIn: HabitCheckIn.ID)
        case create(HabitCreate)
    }

    private struct State {
        var calls: [Call] = []
        var failures: [AppError] = []
        var gate: (@Sendable () async -> Void)?
    }

    private let lock = OSAllocatedUnfairLock(initialState: State())

    public init() {}

    public var calls: [Call] { lock.withLock { $0.calls } }

    public func fail(with errors: AppError...) { lock.withLock { $0.failures = errors } }

    public func hold(until gate: @escaping @Sendable () async -> Void) { lock.withLock { $0.gate = gate } }

    public func checkIn(_ habitID: Habit.ID, on date: LocalDate) async throws -> CheckInResponse {
        try await record(.checkIn(habit: habitID, date: date))
        return CheckInResponse(
            checkIn: HabitCheckIn(id: "check-in-\(habitID)", localDate: date, completedAt: .now),
            alreadyCompleted: false
        )
    }

    public func undoCheckIn(_ habitID: Habit.ID, checkInID: HabitCheckIn.ID) async throws {
        try await record(.undo(habit: habitID, checkIn: checkInID))
    }

    /// Answers with the habit in `habit-create.json`, whatever was sent.
    public func create(_ habit: HabitCreate) async throws -> Habit {
        try await record(.create(habit))
        return try JSONDecoder.api().decode(HabitResponse.self, from: try ContractExamples.example("habit-create.json")).habit
    }

    private func record(_ call: Call) async throws {
        let gate = lock.withLock { state in
            state.calls.append(call)
            defer { state.gate = nil }
            return state.gate
        }
        if let gate { await gate() }
        try lock.withLock { state in
            if !state.failures.isEmpty { throw state.failures.removeFirst() }
        }
    }
}
