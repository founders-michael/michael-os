import Foundation
import Models
import Networking

/// Michael's order, the goals a task supports, and its categories. Every call throws `AppError` or
/// `CancellationError`.
public protocol TaskIntelligenceRepository: Sendable {
    func priorities(page: Int) async throws -> PrioritiesPage
    func goalLinks(_ task: Task.ID) async throws -> [GoalLink]
    /// Replaces the set of goals the task supports (at most five).
    func setGoalLinks(_ task: Task.ID, _ goals: [String]) async throws -> [GoalLink]
    func activeGoals() async throws -> [Goal]
    func categories() async throws -> [TaxonomyCategory]
    func classifications(_ task: Task.ID) async throws -> [Classification]
    func classify(_ task: Task.ID, as categoryKey: String) async throws -> Classification
    /// Removes a category, or dismisses a suggestion.
    func removeClassification(_ id: Classification.ID) async throws
    /// Nil when Michael found no category that clearly fits. `validation` with `DATA_USE_ACKNOWLEDGEMENT_REQUIRED`
    /// under Gemini's unpaid tier.
    func suggest(_ task: Task.ID, dataUseAcknowledged: Bool) async throws -> Classification?
    func confirm(_ id: Classification.ID) async throws -> Classification
}

public struct RemoteTaskIntelligenceRepository: TaskIntelligenceRepository {
    private let client: APIClient

    static let pageSize = 30
    private static let base = "/api/lifestyle/classifications"

    public init(client: APIClient) {
        self.client = client
    }

    public func priorities(page: Int) async throws -> PrioritiesPage {
        let query = [URLQueryItem(name: "page", value: String(page)), URLQueryItem(name: "limit", value: String(Self.pageSize))]
        return try await client.send(APIRequest<PrioritiesPage>.get("/api/tasks/priorities", query: query)).value
    }

    public func goalLinks(_ task: Task.ID) async throws -> [GoalLink] {
        try await client.send(APIRequest<GoalLinks>.get("/api/tasks/\(task)/goals")).value.goals
    }

    public func setGoalLinks(_ task: Task.ID, _ goals: [String]) async throws -> [GoalLink] {
        try await client.send(APIRequest<GoalLinks>.put("/api/tasks/\(task)/goals", body: GoalLinksUpdate(goalIds: goals))).value.goals
    }

    public func activeGoals() async throws -> [Goal] {
        let query = [URLQueryItem(name: "status", value: "ACTIVE"), URLQueryItem(name: "sort", value: "targetDate")]
        return try await client.send(APIRequest<GoalList>.get("/api/goals", query: query)).value.goals
    }

    public func categories() async throws -> [TaxonomyCategory] {
        let query = [URLQueryItem(name: "product", value: "lifestyle"), URLQueryItem(name: "limit", value: "200")]
        return try await client.send(APIRequest<TaxonomyResponse>.get("/api/taxonomy", query: query)).value.categories
            .filter { $0.entityTypes.contains("TASK") }
    }

    public func classifications(_ task: Task.ID) async throws -> [Classification] {
        let query = [
            URLQueryItem(name: "entityType", value: "TASK"), URLQueryItem(name: "entityId", value: task),
            URLQueryItem(name: "limit", value: "50"),
        ]
        return try await client.send(APIRequest<ClassificationList>.get(Self.base, query: query)).value.classifications
    }

    public func classify(_ task: Task.ID, as categoryKey: String) async throws -> Classification {
        let body = ClassificationCreate(entityId: task, categoryKey: categoryKey)
        return try await client.send(APIRequest<ClassificationResponse>.post(Self.base, body: body)).value.classification
    }

    public func removeClassification(_ id: Classification.ID) async throws {
        _ = try await client.send(APIRequest<NoContent>.delete("\(Self.base)/\(id)"))
    }

    public func suggest(_ task: Task.ID, dataUseAcknowledged: Bool) async throws -> Classification? {
        let body = SuggestionRequest(entityId: task, dataUseAcknowledged: dataUseAcknowledged)
        return try await client.send(APIRequest<SuggestionResponse>.post("\(Self.base)/suggest", body: body)).value.suggestion
    }

    public func confirm(_ id: Classification.ID) async throws -> Classification {
        try await client.send(APIRequest<ClassificationResponse>.post("\(Self.base)/\(id)/confirm", body: EmptyBody())).value
            .classification
    }
}
