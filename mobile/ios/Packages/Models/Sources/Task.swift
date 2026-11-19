import Foundation

// Named after the API model. Swift's concurrency type is written `_Concurrency.Task` where both are in scope.
public struct Task: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let title: String
    public let description: String?
    public let status: TaskStatus
    public let priority: TaskPriority
    public let estimatedDurationMinutes: Int?
    public let remainingDurationMinutes: Int?
    public let dueDate: LocalDate?
    public let completedAt: Date?
    public let createdAt: Date
    public let updatedAt: Date

    public init(
        id: String,
        title: String,
        description: String?,
        status: TaskStatus,
        priority: TaskPriority,
        estimatedDurationMinutes: Int?,
        remainingDurationMinutes: Int?,
        dueDate: LocalDate?,
        completedAt: Date?,
        createdAt: Date,
        updatedAt: Date
    ) {
        self.id = id
        self.title = title
        self.description = description
        self.status = status
        self.priority = priority
        self.estimatedDurationMinutes = estimatedDurationMinutes
        self.remainingDurationMinutes = remainingDurationMinutes
        self.dueDate = dueDate
        self.completedAt = completedAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public enum TaskStatus: String, OpenEnum {
    case todo = "TODO"
    case inProgress = "IN_PROGRESS"
    case completed = "COMPLETED"
    case unknown
}

public enum TaskPriority: String, OpenEnum {
    case low = "LOW"
    case medium = "MEDIUM"
    case high = "HIGH"
    case unknown
}

public struct TaskResponse: Decodable, Equatable, Sendable {
    public let task: Task
}

/// `PATCH /api/tasks/{id}`. The server refuses unknown fields, so only what changes is sent.
public struct TaskUpdate: Encodable, Equatable, Sendable {
    public let status: TaskStatus

    public init(status: TaskStatus) {
        self.status = status
    }
}

public struct TaskPage: Decodable, Equatable, Sendable {
    public let tasks: [Task]
    public let page: Int
    public let limit: Int
    public let total: Int
    public let pages: Int
}
