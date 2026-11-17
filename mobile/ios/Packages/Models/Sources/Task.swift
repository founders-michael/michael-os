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

public struct TaskPage: Decodable, Equatable, Sendable {
    public let tasks: [Task]
    public let page: Int
    public let limit: Int
    public let total: Int
    public let pages: Int
}
