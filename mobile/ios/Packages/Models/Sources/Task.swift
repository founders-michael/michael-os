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
    /// Kept when a repeat is stopped, with `active` false.
    public let recurrence: TaskRecurrence?
    public let remindAt: Date?
    public let reminderSent: Bool

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
        updatedAt: Date,
        recurrence: TaskRecurrence? = nil,
        remindAt: Date? = nil,
        reminderSent: Bool = false
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
        self.recurrence = recurrence
        self.remindAt = remindAt
        self.reminderSent = reminderSent
    }

    private enum CodingKeys: String, CodingKey {
        case id, title, description, status, priority, estimatedDurationMinutes, remainingDurationMinutes, dueDate
        case completedAt, createdAt, updatedAt, recurrence, remindAt, reminderSent
    }

    // Responses saved before repeats and reminders existed have neither field.
    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decode(String.self, forKey: .title)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        status = try container.decode(TaskStatus.self, forKey: .status)
        priority = try container.decode(TaskPriority.self, forKey: .priority)
        estimatedDurationMinutes = try container.decodeIfPresent(Int.self, forKey: .estimatedDurationMinutes)
        remainingDurationMinutes = try container.decodeIfPresent(Int.self, forKey: .remainingDurationMinutes)
        dueDate = try container.decodeIfPresent(LocalDate.self, forKey: .dueDate)
        completedAt = try container.decodeIfPresent(Date.self, forKey: .completedAt)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        updatedAt = try container.decode(Date.self, forKey: .updatedAt)
        recurrence = try container.decodeIfPresent(TaskRecurrence.self, forKey: .recurrence)
        remindAt = try container.decodeIfPresent(Date.self, forKey: .remindAt)
        reminderSent = try container.decodeIfPresent(Bool.self, forKey: .reminderSent) ?? false
    }

    /// The repeat, when it still runs.
    public var activeRecurrence: TaskRecurrence? {
        recurrence?.active == true ? recurrence : nil
    }

    /// A reminder still to come.
    public var pendingReminder: Date? {
        reminderSent || status == .completed ? nil : remindAt
    }
}

public enum RecurrenceFrequency: String, OpenEnum {
    case daily = "DAILY"
    case weekly = "WEEKLY"
    case monthly = "MONTHLY"
    case unknown
}

/// A task's repeat as the server returns it. `label` is the server's wording ("Every Mon, Thu").
public struct TaskRecurrence: Codable, Equatable, Sendable {
    public let frequency: RecurrenceFrequency
    public let interval: Int
    public let weekdays: [Int]
    public let monthDay: Int?
    public let endsOn: LocalDate?
    public let active: Bool
    public let label: String

    public init(
        frequency: RecurrenceFrequency, interval: Int, weekdays: [Int], monthDay: Int?, endsOn: LocalDate?, active: Bool,
        label: String
    ) {
        self.frequency = frequency
        self.interval = interval
        self.weekdays = weekdays
        self.monthDay = monthDay
        self.endsOn = endsOn
        self.active = active
        self.label = label
    }

    public var rule: RecurrenceRule {
        RecurrenceRule(frequency: frequency, interval: interval, weekdays: weekdays, monthDay: monthDay, endsOn: endsOn)
    }
}

/// The repeat the server validates (`recurrence.ts`): weekdays only for weekly, a month day only for monthly.
public struct RecurrenceRule: Encodable, Equatable, Sendable {
    public let frequency: RecurrenceFrequency
    public let interval: Int
    public let weekdays: [Int]
    public let monthDay: Int?
    public let endsOn: LocalDate?

    public init(frequency: RecurrenceFrequency, interval: Int, weekdays: [Int], monthDay: Int?, endsOn: LocalDate?) {
        self.frequency = frequency
        self.interval = interval
        self.weekdays = weekdays.sorted()
        self.monthDay = monthDay
        self.endsOn = endsOn
    }

    private enum CodingKeys: String, CodingKey { case frequency, interval, weekdays, monthDay, endsOn }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(frequency, forKey: .frequency)
        try container.encode(interval, forKey: .interval)
        try container.encode(weekdays, forKey: .weekdays)
        try container.encode(monthDay, forKey: .monthDay)
        try container.encode(endsOn, forKey: .endsOn)
    }
}

/// "Remind me" as the person sets it: a date and time on the profile's clock. The server converts it.
public struct ReminderTime: Encodable, Equatable, Sendable {
    public let date: LocalDate
    public let time: LocalTime

    public init(date: LocalDate, time: LocalTime) {
        self.date = date
        self.time = time
    }
}

/// A field a save changes: a new value, or cleared to null. A field the save leaves alone is not sent at all.
public enum FieldChange<Value: Equatable & Sendable>: Equatable, Sendable {
    case set(Value)
    case clear
}

/// The task form's save, for `POST /api/tasks` and `PATCH /api/tasks/{id}`. The plain fields are always sent, null
/// when empty, as the web form does; the repeat and the reminder only when they changed.
public struct TaskSave: Encodable, Equatable, Sendable {
    public let title: String
    public let description: String?
    public let priority: TaskPriority
    public let estimatedDurationMinutes: Int?
    public let remainingDurationMinutes: Int?
    public let dueDate: LocalDate?
    public let recurrence: FieldChange<RecurrenceRule>?
    public let reminder: FieldChange<ReminderTime>?

    public init(
        title: String,
        description: String?,
        priority: TaskPriority,
        estimatedDurationMinutes: Int?,
        remainingDurationMinutes: Int?,
        dueDate: LocalDate?,
        recurrence: FieldChange<RecurrenceRule>?,
        reminder: FieldChange<ReminderTime>?
    ) {
        self.title = title
        self.description = description
        self.priority = priority
        self.estimatedDurationMinutes = estimatedDurationMinutes
        self.remainingDurationMinutes = remainingDurationMinutes
        self.dueDate = dueDate
        self.recurrence = recurrence
        self.reminder = reminder
    }

    private enum CodingKeys: String, CodingKey {
        case title, description, priority, estimatedDurationMinutes, remainingDurationMinutes, dueDate, recurrence, reminder
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(title, forKey: .title)
        try container.encode(description, forKey: .description)
        try container.encode(priority, forKey: .priority)
        try container.encode(estimatedDurationMinutes, forKey: .estimatedDurationMinutes)
        try container.encode(remainingDurationMinutes, forKey: .remainingDurationMinutes)
        try container.encode(dueDate, forKey: .dueDate)
        try Self.encode(recurrence, forKey: .recurrence, in: &container)
        try Self.encode(reminder, forKey: .reminder, in: &container)
    }

    private static func encode<Value: Encodable>(
        _ change: FieldChange<Value>?, forKey key: CodingKeys, in container: inout KeyedEncodingContainer<CodingKeys>
    ) throws {
        switch change {
        case .set(let value): try container.encode(value, forKey: key)
        case .clear: try container.encodeNil(forKey: key)
        case nil: break
        }
    }
}

/// The list's filters (`taskListQuerySchema`). The server refuses a status that contradicts the view, so the apps
/// never send a status.
public struct TaskQuery: Equatable, Sendable {
    public var view: TaskView
    public var priority: TaskPriority?
    public var sort: TaskSort
    public var search: String
    public var page: Int

    public static let pageSize = 30

    public init(view: TaskView = .all, priority: TaskPriority? = nil, sort: TaskSort = .recent, search: String = "", page: Int = 1) {
        self.view = view
        self.priority = priority
        self.sort = sort
        self.search = search
        self.page = page
    }

    public var items: [URLQueryItem] {
        var items = [
            URLQueryItem(name: "view", value: view.rawValue),
            URLQueryItem(name: "sort", value: sort.rawValue),
            URLQueryItem(name: "page", value: String(page)),
            URLQueryItem(name: "limit", value: String(Self.pageSize)),
        ]
        if let priority { items.append(URLQueryItem(name: "priority", value: priority.rawValue)) }
        let term = search.trimmingCharacters(in: .whitespacesAndNewlines)
        if !term.isEmpty { items.append(URLQueryItem(name: "search", value: String(term.prefix(100)))) }
        return items
    }
}

public enum TaskView: String, CaseIterable, Sendable {
    case all, pending, completed, overdue
}

public enum TaskSort: String, CaseIterable, Sendable {
    case recent, dueDate, priority
    /// Michael's order. Not a server sort: the list reads `/api/tasks/priorities` instead.
    case michael
}

public struct TaskSummaryResponse: Decodable, Equatable, Sendable {
    public let summary: TaskSummary
}

public struct TaskDeleted: Decodable, Equatable, Sendable {
    public let success: Bool
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

    public init(tasks: [Task], page: Int, limit: Int, total: Int, pages: Int) {
        self.tasks = tasks
        self.page = page
        self.limit = limit
        self.total = total
        self.pages = pages
    }
}
