import Foundation

/// `GET /api/lifestyle/daily-review`: one local date as the server reads it. Every count and status is the server's.
public struct DailyReview: Decodable, Equatable, Sendable {
    public let date: LocalDate
    /// The profile's zone; clock times on this screen are shown in it.
    public let timeZone: String
    public let overview: ReviewOverview
    public let plannedTasks: [ReviewTask]
    public let completedTasks: [ReviewCompletion]
    public let missedTasks: [ReviewTask]
    public let time: ReviewTime
    /// Nil until the first save for the date.
    public let reflection: StoredReflection?
    public let tomorrow: ReviewTomorrow
    public let weekly: ReviewWeek
}

public struct ReviewOverview: Decodable, Equatable, Sendable {
    public let planned: Int
    public let completed: Int
    public let inProgress: Int
    public let pending: Int
    public let overdue: Int
    public let completionPercent: Int
    public let cancelledSessions: Int
}

/// A task as it stood on the review date.
public struct ReviewTask: Decodable, Equatable, Sendable, Identifiable {
    public let task: Task
    /// Nil when the history cannot say.
    public let statusAtSelectedDate: TaskStatus?
    public let dueDateAtSelectedDate: LocalDate?
    public let overdueAtSelectedDate: Bool
    /// Sent only on missed tasks; false elsewhere.
    public let intentionallySkipped: Bool

    public var id: Task.ID { task.id }

    private enum CodingKeys: String, CodingKey {
        case task, statusAtSelectedDate, dueDateAtSelectedDate, overdueAtSelectedDate, intentionallySkipped
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        task = try container.decode(Task.self, forKey: .task)
        statusAtSelectedDate = try container.decodeIfPresent(TaskStatus.self, forKey: .statusAtSelectedDate)
        dueDateAtSelectedDate = try container.decodeIfPresent(LocalDate.self, forKey: .dueDateAtSelectedDate)
        overdueAtSelectedDate = try container.decode(Bool.self, forKey: .overdueAtSelectedDate)
        intentionallySkipped = try container.decodeIfPresent(Bool.self, forKey: .intentionallySkipped) ?? false
    }
}

public struct ReviewCompletion: Decodable, Equatable, Sendable {
    public let task: Task
    public let completedAt: Date
}

/// Scheduled time only. Actual time is not tracked, so there is no actual figure to show.
public struct ReviewTime: Decodable, Equatable, Sendable {
    /// Nil when availability is not configured.
    public let plannedWorkingMinutes: Int?
    public let scheduledTaskMinutes: Int
    public let scheduledCalendarMinutes: Int
}

public struct ReviewTomorrow: Decodable, Equatable, Sendable {
    public let date: LocalDate
    public let incompleteTasks: [Task]
}

public struct ReviewWeek: Decodable, Equatable, Sendable {
    public struct Day: Decodable, Equatable, Sendable {
        public let date: LocalDate
        public let planned: Int
        public let completed: Int
    }

    public struct Goal: Decodable, Equatable, Sendable, Identifiable {
        public let id: String
        public let title: String
        public let progress: Int
    }

    public struct Habits: Decodable, Equatable, Sendable {
        public let scheduled: Int
        public let completed: Int
        public let consistencyPercent: Int
    }

    public let days: [Day]
    public let planned: Int
    public let completed: Int
    public let completionPercent: Int
    public let incomplete: Int
    public let rescheduled: Int
    public let consistencyDays: Int
    public let goals: [Goal]
    public let habits: Habits
}

/// The reflection as stored. It carries `updatedAt`, which a save must never send back.
public struct StoredReflection: Decodable, Equatable, Sendable {
    public let wentWell: String
    public let challenges: String
    public let blockers: String
    public let lessonsLearned: String
    public let improvements: String
    public let intentionallySkippedTaskIds: [String]
}

public struct ReflectionResponse: Decodable, Equatable, Sendable {
    public let reflection: StoredReflection
}

/// `PUT /api/lifestyle/daily-review`. Every field is required; built field by field, so no stored field leaks in.
public struct ReflectionSave: Encodable, Equatable, Sendable {
    public let date: LocalDate
    public let wentWell: String
    public let challenges: String
    public let blockers: String
    public let lessonsLearned: String
    public let improvements: String
    public let intentionallySkippedTaskIds: [String]

    public init(
        date: LocalDate, wentWell: String, challenges: String, blockers: String, lessonsLearned: String, improvements: String,
        intentionallySkippedTaskIds: [String]
    ) {
        self.date = date
        self.wentWell = wentWell
        self.challenges = challenges
        self.blockers = blockers
        self.lessonsLearned = lessonsLearned
        self.improvements = improvements
        self.intentionallySkippedTaskIds = intentionallySkippedTaskIds
    }
}

/// `POST /api/lifestyle/daily-review/carry-forward`: a date (with both times or neither), or unscheduled.
public struct CarryForward: Encodable, Equatable, Sendable {
    public let reviewDate: LocalDate
    public let taskId: String
    /// Nil when the task is left unscheduled.
    public let targetDate: LocalDate?
    public let startTime: LocalTime?
    public let endTime: LocalTime?

    public static func move(_ task: String, from review: LocalDate, to date: LocalDate, start: LocalTime?, end: LocalTime?) -> CarryForward
    {
        CarryForward(reviewDate: review, taskId: task, targetDate: date, startTime: start, endTime: end)
    }

    public static func unschedule(_ task: String, from review: LocalDate) -> CarryForward {
        CarryForward(reviewDate: review, taskId: task, targetDate: nil, startTime: nil, endTime: nil)
    }

    private enum CodingKeys: String, CodingKey { case reviewDate, taskId, targetDate, unschedule, startTime, endTime }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(reviewDate, forKey: .reviewDate)
        try container.encode(taskId, forKey: .taskId)
        if let targetDate {
            try container.encode(targetDate, forKey: .targetDate)
        } else {
            try container.encode(true, forKey: .unschedule)
        }
        try container.encodeIfPresent(startTime, forKey: .startTime)
        try container.encodeIfPresent(endTime, forKey: .endTime)
    }
}

public struct CarryForwardResponse: Decodable, Equatable, Sendable {
    public struct Result: Decodable, Equatable, Sendable {
        public let taskId: String
        /// Nil when the task was left unscheduled.
        public let targetDate: LocalDate?
    }

    public let result: Result
}
