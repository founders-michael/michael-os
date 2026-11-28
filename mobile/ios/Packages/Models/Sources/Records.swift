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
    /// Only a task session links to a task.
    public let taskId: String?
    public let taskTitle: String?
    public let eventType: CalendarEventType
    public let schedulingMode: SchedulingMode
    public let title: String
    public let description: String?
    public let startAt: Date
    public let endAt: Date
    public let timeZone: String

    public init(
        id: String,
        taskId: String? = nil,
        taskTitle: String? = nil,
        eventType: CalendarEventType,
        schedulingMode: SchedulingMode = .fixed,
        title: String,
        description: String? = nil,
        startAt: Date,
        endAt: Date,
        timeZone: String
    ) {
        self.id = id
        self.taskId = taskId
        self.taskTitle = taskTitle
        self.eventType = eventType
        self.schedulingMode = schedulingMode
        self.title = title
        self.description = description
        self.startAt = startAt
        self.endAt = endAt
        self.timeZone = timeZone
    }
}

/// `GET /api/calendar/events`: every event overlapping the range. `truncated` true means some were left out.
public struct CalendarEventsPage: Decodable, Equatable, Sendable {
    public let events: [CalendarEvent]
    public let truncated: Bool
}

/// An event a create or a move would overlap, from a 409.
public struct CalendarConflict: Decodable, Equatable, Sendable {
    public let eventId: String
    public let title: String
    public let startAt: Date
    public let endAt: Date

    public init(eventId: String, title: String, startAt: Date, endAt: Date) {
        self.eventId = eventId
        self.title = title
        self.startAt = startAt
        self.endAt = endAt
    }
}

/// `PATCH /api/calendar/events/{id}`. The type cannot change; every other field is sent, `description` and
/// `taskId` as null to clear them.
public struct CalendarEventUpdate: Encodable, Equatable, Sendable {
    public let title: String
    public let description: String?
    public let taskId: String?
    public let startAt: Date
    public let endAt: Date
    public let timeZone: String
    /// Only a task session has a task to send.
    public let sendsTask: Bool

    public init(title: String, description: String?, taskId: String?, startAt: Date, endAt: Date, timeZone: String, sendsTask: Bool) {
        self.title = title
        self.description = description
        self.taskId = taskId
        self.startAt = startAt
        self.endAt = endAt
        self.timeZone = timeZone
        self.sendsTask = sendsTask
    }

    private enum CodingKeys: String, CodingKey { case title, description, taskId, startAt, endAt, timeZone }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(title, forKey: .title)
        try container.encode(description, forKey: .description)
        if sendsTask { try container.encode(taskId, forKey: .taskId) }
        try container.encode(startAt, forKey: .startAt)
        try container.encode(endAt, forKey: .endAt)
        try container.encode(timeZone, forKey: .timeZone)
    }
}

/// An open task with no future session, from `GET /api/calendar/unscheduled-tasks` (at most 30, due first).
public struct UnscheduledTask: Decodable, Equatable, Sendable, Identifiable {
    public let id: String
    public let title: String
    public let priority: TaskPriority
    public let estimatedDurationMinutes: Int?
    public let dueDate: LocalDate?

    public init(
        id: String, title: String, priority: TaskPriority = .medium, estimatedDurationMinutes: Int? = nil, dueDate: LocalDate? = nil
    ) {
        self.id = id
        self.title = title
        self.priority = priority
        self.estimatedDurationMinutes = estimatedDurationMinutes
        self.dueDate = dueDate
    }
}

public struct UnscheduledTasksResponse: Decodable, Sendable {
    public let tasks: [UnscheduledTask]
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
    /// Only a task session may name one.
    public let taskId: String?
    public let startAt: Date
    public let endAt: Date
    public let timeZone: String

    public init(
        title: String,
        description: String?,
        eventType: CalendarEventType,
        taskId: String? = nil,
        startAt: Date,
        endAt: Date,
        timeZone: String
    ) {
        self.title = title
        self.description = description
        self.eventType = eventType
        self.taskId = taskId
        self.startAt = startAt
        self.endAt = endAt
        self.timeZone = timeZone
    }

    private enum CodingKeys: String, CodingKey {
        case title, description, eventType, schedulingMode, taskId, startAt, endAt, timeZone
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
