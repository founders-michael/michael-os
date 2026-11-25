import Models
import Networking

/// Every call throws `AppError` or `CancellationError`.
public protocol HabitRepository: Sendable {
    /// Safe to repeat: a second check-in for the same date answers with the first.
    func checkIn(_ habitID: Habit.ID, on date: LocalDate) async throws -> CheckInResponse
    func undoCheckIn(_ habitID: Habit.ID, checkInID: HabitCheckIn.ID) async throws
    func create(_ habit: HabitCreate) async throws -> Habit
}

public struct RemoteHabitRepository: HabitRepository {
    private let client: APIClient

    public init(client: APIClient) {
        self.client = client
    }

    public func checkIn(_ habitID: Habit.ID, on date: LocalDate) async throws -> CheckInResponse {
        let request = try APIRequest<CheckInResponse>.post("/api/habits/\(habitID)/check-ins", body: CheckInRequest(localDate: date))
        return try await client.send(request).value
    }

    public func undoCheckIn(_ habitID: Habit.ID, checkInID: HabitCheckIn.ID) async throws {
        _ = try await client.send(APIRequest<SuccessResponse>.delete("/api/habits/\(habitID)/check-ins/\(checkInID)"))
    }

    public func create(_ habit: HabitCreate) async throws -> Habit {
        try await client.send(APIRequest<HabitResponse>.post("/api/habits", body: habit)).value.habit
    }
}
