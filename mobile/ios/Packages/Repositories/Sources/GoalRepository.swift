import Models
import Networking

/// Every call throws `AppError` or `CancellationError`.
public protocol GoalRepository: Sendable {
    func create(_ goal: GoalCreate) async throws -> Goal
}

public struct RemoteGoalRepository: GoalRepository {
    private let client: APIClient

    public init(client: APIClient) {
        self.client = client
    }

    public func create(_ goal: GoalCreate) async throws -> Goal {
        try await client.send(APIRequest<GoalResponse>.post("/api/goals", body: goal)).value.goal
    }
}
