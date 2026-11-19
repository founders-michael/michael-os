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
