import Foundation
import Models
import Networking

/// Every call throws `AppError` or `CancellationError`.
public protocol TaskRepository: Sendable {
    func list(_ query: TaskQuery) async throws -> TaskPage
    func task(_ id: Task.ID) async throws -> Task
    func summary() async throws -> TaskSummary
    func update(_ id: Task.ID, _ change: TaskUpdate) async throws -> Task
    func create(_ task: TaskCreate) async throws -> Task
    /// Creates a task, or saves the task form over an existing one.
    func save(_ task: TaskSave, to id: Task.ID?) async throws -> Task
    /// Removes the task with its history and planned sessions.
    func delete(_ id: Task.ID) async throws
    /// Moves a repeating task to its series' next date. `conflict` when the series has stopped.
    func skip(_ id: Task.ID) async throws -> Task
}

public struct RemoteTaskRepository: TaskRepository {
    private let client: APIClient

    public init(client: APIClient) {
        self.client = client
    }

    public func list(_ query: TaskQuery) async throws -> TaskPage {
        try await client.send(.get("/api/tasks", query: query.items)).value
    }

    public func task(_ id: Task.ID) async throws -> Task {
        try await client.send(APIRequest<TaskResponse>.get("/api/tasks/\(id)")).value.task
    }

    public func summary() async throws -> TaskSummary {
        try await client.send(APIRequest<TaskSummaryResponse>.get("/api/tasks/summary")).value.summary
    }

    public func update(_ id: Task.ID, _ change: TaskUpdate) async throws -> Task {
        try await client.send(APIRequest<TaskResponse>.patch("/api/tasks/\(id)", body: change)).value.task
    }

    public func create(_ task: TaskCreate) async throws -> Task {
        try await client.send(APIRequest<TaskResponse>.post("/api/tasks", body: task)).value.task
    }

    public func save(_ task: TaskSave, to id: Task.ID?) async throws -> Task {
        let request =
            if let id {
                try APIRequest<TaskResponse>.patch("/api/tasks/\(id)", body: task)
            } else {
                try APIRequest<TaskResponse>.post("/api/tasks", body: task)
            }
        return try await client.send(request).value.task
    }

    public func delete(_ id: Task.ID) async throws {
        _ = try await client.send(APIRequest<TaskDeleted>.delete("/api/tasks/\(id)"))
    }

    public func skip(_ id: Task.ID) async throws -> Task {
        try await client.send(APIRequest<TaskResponse>.post("/api/tasks/\(id)/skip", body: EmptyBody())).value.task
    }
}
