import Foundation

/// `GET /api/my-day`. Each optional section is null when the server could not load that part; the rest still
/// arrives. Greeting, briefing and notices are computed on the server by the web screen's rules.
public struct MyDay: Decodable, Equatable, Sendable {
    public var today: LocalDate
    public var selectedDate: LocalDate
    public var timeZone: String
    public var greeting: String
    public var greetingName: String
    public var briefing: String?
    public var notices: [MyDayNotice]
    public var tasks: MyDayTasks?
    public var timeline: [TimelineItem]?
    // Null exactly when `timeline` is: both come from the task read, which may fail on its own.
    // swiftlint:disable:next discouraged_optional_boolean
    public var timelineTruncated: Bool?
    public var habits: MyDayHabits?
}

public struct MyDayNotice: Decodable, Equatable, Sendable, Identifiable {
    public enum Tone: String, OpenEnum {
        case warn
        case ai
        case unknown
    }

    public var id: String
    public var tone: Tone
    public var tag: String
    public var text: String
    public var actionLabel: String
    /// The question to prefill in the Michael tab. Tapping the action never sends it.
    public var prompt: String?
}

public struct MyDayTasks: Decodable, Equatable, Sendable {
    public var summary: TaskSummary
    public var dailySummary: DailyTaskSummary
    public var dailyTasks: [DailyTask]
    public var sections: TaskSections
}

public struct TaskSummary: Decodable, Equatable, Sendable {
    public var dueToday: Int
    public var outstanding: Int
    public var completed: Int
    public var overdue: Int
    public var today: LocalDate
}

/// Distinct tasks of the selected date, counted by their status on that date.
public struct DailyTaskSummary: Decodable, Equatable, Sendable {
    public var total: Int
    public var completed: Int
    public var inProgress: Int
    public var pending: Int
    /// Tasks whose status on a past date cannot be reconstructed.
    public var unclassified: Int
    public var completionPercent: Int
}

public struct DailyTask: Decodable, Equatable, Sendable, Identifiable {
    public var task: Task
    /// Null on a past date whose status history is unavailable.
    public var statusAtSelectedDate: TaskStatus?
    public var completionAtSelectedDate: Date?
    public var activityAtSelectedDate: Date?
    public var plannedSessions: [PlannedSession]

    public var id: Task.ID { task.id }
}

public struct PlannedSession: Decodable, Equatable, Sendable, Identifiable {
    public var id: String
    public var startAt: Date
    public var endAt: Date
    public var timeZone: String
}

public struct TaskSections: Decodable, Equatable, Sendable {
    public var today: [SectionTask]
    public var overdue: [SectionTask]
    public var upcoming: [SectionTask]
    public var backlog: [SectionTask]
    public var completed: [SectionTask]
}

public struct SectionTask: Decodable, Equatable, Sendable, Identifiable {
    public var task: Task
    public var sessions: [PlannedSession]

    public var id: Task.ID { task.id }
}

public struct TimelineItem: Decodable, Equatable, Sendable, Identifiable {
    public enum Kind: String, OpenEnum {
        case focus
        case commitment
        case unavailable
        case unknown
    }

    public var id: String
    public var kind: Kind
    /// The server's name for the kind, such as "Focus session".
    public var label: String
    public var title: String
    public var description: String?
    public var startAt: Date
    public var endAt: Date
    public var timeZone: String
    public var taskId: Task.ID?
    public var taskTitle: String?
}

/// Today's scheduled habits, at most four. Always for the server's today, whatever date was asked for.
public struct MyDayHabits: Decodable, Equatable, Sendable {
    public var today: LocalDate
    public var summary: HabitSummary
    public var habits: [Habit]
}

public struct HabitSummary: Decodable, Equatable, Sendable {
    public var active: Int
    public var scheduledToday: Int
    public var completedToday: Int
}
