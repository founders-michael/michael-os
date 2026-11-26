import Foundation

/// `POST /api/tasks`. The server refuses unknown fields; a nil field is left out.
public struct TaskCreate: Encodable, Equatable, Sendable {
    public let title: String
    public let description: String?
    public let priority: TaskPriority
    public let dueDate: LocalDate?
    public let estimatedDurationMinutes: Int?

    public init(
        title: String,
        description: String?,
        priority: TaskPriority,
        dueDate: LocalDate?,
        estimatedDurationMinutes: Int?
    ) {
        self.title = title
        self.description = description
        self.priority = priority
        self.dueDate = dueDate
        self.estimatedDurationMinutes = estimatedDurationMinutes
    }
}

public struct Goal: Decodable, Equatable, Sendable, Identifiable {
    public let id: String
    public let title: String
    public let description: String?
    public let category: String?
    public let status: GoalStatus
    public let progress: Int
    public let targetDate: LocalDate?
    public let completedAt: Date?
    public let milestoneCount: Int
    public let completedMilestoneCount: Int
    public let createdAt: Date
    public let updatedAt: Date

    public init(
        id: String, title: String, description: String?, category: String?, status: GoalStatus, progress: Int, targetDate: LocalDate?,
        completedAt: Date?, milestoneCount: Int, completedMilestoneCount: Int, createdAt: Date, updatedAt: Date
    ) {
        self.id = id
        self.title = title
        self.description = description
        self.category = category
        self.status = status
        self.progress = progress
        self.targetDate = targetDate
        self.completedAt = completedAt
        self.milestoneCount = milestoneCount
        self.completedMilestoneCount = completedMilestoneCount
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public enum GoalStatus: String, OpenEnum {
    case active = "ACTIVE"
    case completed = "COMPLETED"
    case archived = "ARCHIVED"
    case unknown
}

public struct GoalResponse: Decodable, Equatable, Sendable {
    public let goal: Goal
}

public struct GoalCreate: Encodable, Equatable, Sendable {
    public let title: String
    public let description: String?
    public let category: String?
    public let targetDate: LocalDate?
    public let progress: Int

    public init(title: String, description: String?, category: String?, targetDate: LocalDate?, progress: Int) {
        self.title = title
        self.description = description
        self.category = category
        self.targetDate = targetDate
        self.progress = progress
    }
}

public struct HabitResponse: Decodable, Equatable, Sendable {
    public let habit: Habit
}

/// `POST /api/habits`. A daily habit sends no weekdays; an end time is only valid with a start time.
public struct HabitCreate: Encodable, Equatable, Sendable {
    public let title: String
    public let description: String?
    public let frequency: HabitFrequency
    public let weekdays: [Int]
    public let startTime: LocalTime?
    public let endTime: LocalTime?

    public init(
        title: String,
        description: String?,
        frequency: HabitFrequency,
        weekdays: [Int],
        startTime: LocalTime?,
        endTime: LocalTime?
    ) {
        self.title = title
        self.description = description
        self.frequency = frequency
        self.weekdays = weekdays
        self.startTime = startTime
        self.endTime = endTime
    }
}

public struct CalendarEvent: Decodable, Equatable, Sendable, Identifiable {
    public let id: String
    public let taskId: String?
    public let eventType: CalendarEventType
    public let schedulingMode: SchedulingMode
    public let title: String
    public let description: String?
    public let startAt: Date
    public let endAt: Date
    public let timeZone: String
}

public enum CalendarEventType: String, OpenEnum {
    case taskSession = "TASK_SESSION"
    case commitment = "COMMITMENT"
    case unavailable = "UNAVAILABLE"
    case unknown
}

public enum SchedulingMode: String, OpenEnum {
    case fixed = "FIXED"
    case flexible = "FLEXIBLE"
    case unknown
}

public struct CalendarEventResponse: Decodable, Equatable, Sendable {
    public let event: CalendarEvent
}

/// `POST /api/calendar/events`. Overlapping another event is refused with 409.
public struct CalendarEventCreate: Encodable, Equatable, Sendable {
    public let title: String
    public let description: String?
    public let eventType: CalendarEventType
    /// Only a task session may be flexible, so an event made outside planning is always fixed.
    public let schedulingMode = SchedulingMode.fixed
    public let startAt: Date
    public let endAt: Date
    public let timeZone: String

    public init(
        title: String,
        description: String?,
        eventType: CalendarEventType,
        startAt: Date,
        endAt: Date,
        timeZone: String
    ) {
        self.title = title
        self.description = description
        self.eventType = eventType
        self.startAt = startAt
        self.endAt = endAt
        self.timeZone = timeZone
    }

    private enum CodingKeys: String, CodingKey {
        case title, description, eventType, schedulingMode, startAt, endAt, timeZone
    }
}

public enum MemorySensitivity: String, OpenEnum {
    case standard = "STANDARD"
    case personal = "PERSONAL"
    case sensitive = "SENSITIVE"
    case unknown
}

public struct Memory: Decodable, Equatable, Sendable, Identifiable {
    public let id: String
    public let content: String
    public let sensitivity: MemorySensitivity
    public let keepUntil: LocalDate?
}

public struct MemoryResponse: Decodable, Equatable, Sendable {
    public let memory: Memory
}

/// `POST /api/memories`. Without `keepUntil` the memory is kept until deleted.
public struct MemoryCreate: Encodable, Equatable, Sendable {
    public let content: String
    public let sensitivity: MemorySensitivity
    public let keepUntil: LocalDate?

    public init(content: String, sensitivity: MemorySensitivity, keepUntil: LocalDate?) {
        self.content = content
        self.sensitivity = sensitivity
        self.keepUntil = keepUntil
    }
}

extension JSONEncoder {
    /// Instants leave as ISO 8601 in UTC, the format the server's schemas accept.
    public static func api() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}
