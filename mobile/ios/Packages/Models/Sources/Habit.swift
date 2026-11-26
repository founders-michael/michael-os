import Foundation

public struct Habit: Decodable, Equatable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var description: String?
    public var frequency: HabitFrequency
    /// ISO weekdays, 1 for Monday to 7 for Sunday. Empty for a daily habit.
    public var weekdays: [Int]
    public var status: HabitStatus
    public var startTime: LocalTime?
    public var endTime: LocalTime?
    public var today: LocalDate
    public var todayScheduled: Bool
    public var completedToday: Bool
    public var currentStreak: Int
    public var bestStreak: Int
    public var completionPercentage: Int
    public var eligibleDays: Int
    public var completedDays: Int
    public var periodStart: LocalDate
    public var periodEnd: LocalDate
    /// The last 30 days.
    public var checkIns: [HabitCheckIn]
    public var createdAt: Date
    public var updatedAt: Date
}

public enum HabitFrequency: String, OpenEnum {
    case daily = "DAILY"
    case selectedDays = "SELECTED_DAYS"
    case unknown
}

public enum HabitStatus: String, OpenEnum {
    case active = "ACTIVE"
    case archived = "ARCHIVED"
    case unknown
}

public struct HabitCheckIn: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var localDate: LocalDate
    public var completedAt: Date

    public init(id: String, localDate: LocalDate, completedAt: Date) {
        self.id = id
        self.localDate = localDate
        self.completedAt = completedAt
    }
}

/// `POST /api/habits/{id}/check-ins`. A repeated check-in answers with the existing one and `alreadyCompleted`.
public struct CheckInResponse: Decodable, Equatable, Sendable {
    public var checkIn: HabitCheckIn
    public var alreadyCompleted: Bool

    public init(checkIn: HabitCheckIn, alreadyCompleted: Bool) {
        self.checkIn = checkIn
        self.alreadyCompleted = alreadyCompleted
    }
}

public struct CheckInRequest: Encodable, Sendable {
    public let localDate: LocalDate

    public init(localDate: LocalDate) {
        self.localDate = localDate
    }
}

public struct SuccessResponse: Decodable, Equatable, Sendable {
    public let success: Bool
}

/// The habit form's save, for `POST /api/habits` and `PATCH /api/habits/{id}`. Every field is sent, null when empty,
/// so clearing a time or the notes reaches the server.
public struct HabitSave: Encodable, Equatable, Sendable {
    public let title: String
    public let description: String?
    public let frequency: HabitFrequency
    public let weekdays: [Int]
    public let startTime: LocalTime?
    public let endTime: LocalTime?

    public init(title: String, description: String?, frequency: HabitFrequency, weekdays: [Int], startTime: LocalTime?, endTime: LocalTime?)
    {
        self.title = title
        self.description = description
        self.frequency = frequency
        self.weekdays = weekdays.sorted()
        self.startTime = startTime
        self.endTime = endTime
    }

    private enum CodingKeys: String, CodingKey { case title, description, frequency, weekdays, startTime, endTime }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(title, forKey: .title)
        try container.encode(description, forKey: .description)
        try container.encode(frequency, forKey: .frequency)
        try container.encode(weekdays, forKey: .weekdays)
        try container.encode(startTime, forKey: .startTime)
        try container.encode(endTime, forKey: .endTime)
    }
}

/// `PATCH /api/habits/{id}` that archives or reactivates.
public struct HabitStatusChange: Encodable, Equatable, Sendable {
    public let status: HabitStatus

    public init(status: HabitStatus) {
        self.status = status
    }
}

public struct HabitList: Decodable, Equatable, Sendable {
    public let habits: [Habit]
}

extension Habit {
    /// Check-ins by date, for the 30-day strip.
    public func isDone(on date: LocalDate) -> Bool { checkIns.contains { $0.localDate == date } }

    /// Whether the schedule has the habit on `date`, by weekday. The server's `todayScheduled` rules for today.
    public func isScheduled(on date: LocalDate) -> Bool {
        frequency == .daily || weekdays.contains(date.weekday)
    }
}
