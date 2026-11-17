import Foundation

public struct Profile: Codable, Equatable, Sendable {
    public let userId: String
    public let preferredName: String
    public let timeZone: String
    public let wakeUpTime: LocalTime
    public let bedtime: LocalTime
    public let workStartTime: LocalTime?
    public let workEndTime: LocalTime?
    public let workDays: [DayOfWeek]
    public let priorities: [String]
    public let focusSessionMinutes: Int
    public let breakDurationMinutes: Int
    public let planningStyle: PlanningStyle
    public let onboardingStep: Int
    public let onboardingCompleted: Bool
    public let createdAt: Date
    public let updatedAt: Date
}

/// `profile` is null until onboarding saves its first step.
public struct ProfileResponse: Decodable, Equatable, Sendable {
    public let profile: Profile?
}

public enum DayOfWeek: String, OpenEnum {
    case monday = "MONDAY"
    case tuesday = "TUESDAY"
    case wednesday = "WEDNESDAY"
    case thursday = "THURSDAY"
    case friday = "FRIDAY"
    case saturday = "SATURDAY"
    case sunday = "SUNDAY"
    case unknown
}

public enum PlanningStyle: String, OpenEnum {
    case structured = "STRUCTURED"
    case balanced = "BALANCED"
    case flexible = "FLEXIBLE"
    case unknown
}
