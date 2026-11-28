import Foundation
import Models
import Networking

/// Every call throws `AppError` or `CancellationError`.
public protocol GoalRepository: Sendable {
    func create(_ goal: GoalCreate) async throws -> Goal
    /// Unpaginated on the server, newest first. Nil status lists every goal.
    func list(_ status: GoalStatus?) async throws -> [Goal]
    func goal(_ id: Goal.ID) async throws -> Goal
    /// The server's date in the profile's zone.
    func today() async throws -> LocalDate
    /// Creates a goal, or saves the goal form over an existing one.
    func save(_ goal: GoalSave, to id: Goal.ID?) async throws -> Goal
    func change(_ id: Goal.ID, _ change: GoalChange) async throws -> Goal
    /// Removes the goal and its milestones.
    func delete(_ id: Goal.ID) async throws
    func addMilestone(to goal: Goal.ID, _ milestone: MilestoneCreate) async throws
    func change(milestone: GoalMilestone.ID, of goal: Goal.ID, _ change: MilestoneChange) async throws
    func delete(milestone: GoalMilestone.ID, of goal: Goal.ID) async throws
}

public struct RemoteGoalRepository: GoalRepository {
    private let client: APIClient

    public init(client: APIClient) {
        self.client = client
    }

    public func create(_ goal: GoalCreate) async throws -> Goal {
        try await client.send(APIRequest<GoalResponse>.post("/api/goals", body: goal)).value.goal
    }

    public func list(_ status: GoalStatus?) async throws -> [Goal] {
        let query = status.map { [URLQueryItem(name: "status", value: $0.rawValue)] } ?? []
        return try await client.send(APIRequest<GoalList>.get("/api/goals", query: query)).value.goals
    }

    public func goal(_ id: Goal.ID) async throws -> Goal {
        try await client.send(APIRequest<GoalResponse>.get("/api/goals/\(id)")).value.goal
    }

    public func today() async throws -> LocalDate {
        try await client.send(APIRequest<GoalSummaryResponse>.get("/api/goals/summary")).value.summary.today
    }

    public func save(_ goal: GoalSave, to id: Goal.ID?) async throws -> Goal {
        let request =
            if let id {
                try APIRequest<GoalResponse>.patch("/api/goals/\(id)", body: goal)
            } else {
                try APIRequest<GoalResponse>.post("/api/goals", body: goal)
            }
        return try await client.send(request).value.goal
    }

    public func change(_ id: Goal.ID, _ change: GoalChange) async throws -> Goal {
        try await client.send(APIRequest<GoalResponse>.patch("/api/goals/\(id)", body: change)).value.goal
    }

    public func delete(_ id: Goal.ID) async throws {
        _ = try await client.send(APIRequest<SuccessResponse>.delete("/api/goals/\(id)"))
    }

    public func addMilestone(to goal: Goal.ID, _ milestone: MilestoneCreate) async throws {
        _ = try await client.send(APIRequest<MilestoneResponse>.post("/api/goals/\(goal)/milestones", body: milestone))
    }

    public func change(milestone: GoalMilestone.ID, of goal: Goal.ID, _ change: MilestoneChange) async throws {
        _ = try await client.send(APIRequest<MilestoneResponse>.patch("/api/goals/\(goal)/milestones/\(milestone)", body: change))
    }

    public func delete(milestone: GoalMilestone.ID, of goal: Goal.ID) async throws {
        _ = try await client.send(APIRequest<SuccessResponse>.delete("/api/goals/\(goal)/milestones/\(milestone)"))
    }
}
