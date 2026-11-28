import Foundation
import Models
import Networking

/// Every call throws `AppError` or `CancellationError`.
public protocol HabitRepository: Sendable {
    /// Unpaginated on the server. Nil status lists both.
    func list(_ status: HabitStatus?) async throws -> [Habit]
    func habit(_ id: Habit.ID) async throws -> Habit
    /// A repeated check-in answers with the existing one and `alreadyCompleted`.
    func checkIn(_ habitID: Habit.ID, on date: LocalDate) async throws -> CheckInResponse
    func undoCheckIn(_ habitID: Habit.ID, checkInID: HabitCheckIn.ID) async throws
    func create(_ habit: HabitCreate) async throws -> Habit
    /// Creates a habit, or saves the habit form over an existing one.
    func save(_ habit: HabitSave, to id: Habit.ID?) async throws -> Habit
    func setStatus(_ id: Habit.ID, _ status: HabitStatus) async throws -> Habit
    /// Removes the habit and its check-ins.
    func delete(_ id: Habit.ID) async throws
}

public struct RemoteHabitRepository: HabitRepository {
    private let client: APIClient

    public init(client: APIClient) {
        self.client = client
    }

    public func list(_ status: HabitStatus?) async throws -> [Habit] {
        let query = status.map { [URLQueryItem(name: "status", value: $0.rawValue)] } ?? []
        return try await client.send(APIRequest<HabitList>.get("/api/habits", query: query)).value.habits
    }

    public func habit(_ id: Habit.ID) async throws -> Habit {
        try await client.send(APIRequest<HabitResponse>.get("/api/habits/\(id)")).value.habit
    }

    public func checkIn(_ habitID: Habit.ID, on date: LocalDate) async throws -> CheckInResponse {
        try await client.send(APIRequest<CheckInResponse>.post("/api/habits/\(habitID)/check-ins", body: CheckInRequest(localDate: date)))
            .value
    }

    public func undoCheckIn(_ habitID: Habit.ID, checkInID: HabitCheckIn.ID) async throws {
        _ = try await client.send(APIRequest<SuccessResponse>.delete("/api/habits/\(habitID)/check-ins/\(checkInID)"))
    }

    public func create(_ habit: HabitCreate) async throws -> Habit {
        try await client.send(APIRequest<HabitResponse>.post("/api/habits", body: habit)).value.habit
    }

    public func save(_ habit: HabitSave, to id: Habit.ID?) async throws -> Habit {
        let request =
            if let id {
                try APIRequest<HabitResponse>.patch("/api/habits/\(id)", body: habit)
            } else {
                try APIRequest<HabitResponse>.post("/api/habits", body: habit)
            }
        return try await client.send(request).value.habit
    }

    public func setStatus(_ id: Habit.ID, _ status: HabitStatus) async throws -> Habit {
        try await client.send(APIRequest<HabitResponse>.patch("/api/habits/\(id)", body: HabitStatusChange(status: status))).value.habit
    }

    public func delete(_ id: Habit.ID) async throws {
        _ = try await client.send(APIRequest<SuccessResponse>.delete("/api/habits/\(id)"))
    }
}
