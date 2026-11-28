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

/// The body of `PATCH /api/profile`. Every field is sent on every save, and the work hours are sent as `null`
/// rather than left out: the server requires the keys.
public struct ProfileUpdate: Encodable, Equatable, Sendable {
    public var preferredName: String
    public var timeZone: String
    public var wakeUpTime: LocalTime
    public var bedtime: LocalTime
    public var workStartTime: LocalTime?
    public var workEndTime: LocalTime?
    public var workDays: [DayOfWeek]
    public var priorities: [String]
    public var focusSessionMinutes: Int
    public var breakDurationMinutes: Int
    public var planningStyle: PlanningStyle
    public var onboardingStep: Int

    public init(
        preferredName: String, timeZone: String, wakeUpTime: LocalTime, bedtime: LocalTime,
        workStartTime: LocalTime?, workEndTime: LocalTime?, workDays: [DayOfWeek], priorities: [String],
        focusSessionMinutes: Int, breakDurationMinutes: Int, planningStyle: PlanningStyle, onboardingStep: Int
    ) {
        self.preferredName = preferredName
        self.timeZone = timeZone
        self.wakeUpTime = wakeUpTime
        self.bedtime = bedtime
        self.workStartTime = workStartTime
        self.workEndTime = workEndTime
        self.workDays = workDays
        self.priorities = priorities
        self.focusSessionMinutes = focusSessionMinutes
        self.breakDurationMinutes = breakDurationMinutes
        self.planningStyle = planningStyle
        self.onboardingStep = onboardingStep
    }

    private enum CodingKeys: String, CodingKey {
        case preferredName, timeZone, wakeUpTime, bedtime, workStartTime, workEndTime, workDays, priorities
        case focusSessionMinutes, breakDurationMinutes, planningStyle, onboardingStep
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(preferredName, forKey: .preferredName)
        try container.encode(timeZone, forKey: .timeZone)
        try container.encode(wakeUpTime, forKey: .wakeUpTime)
        try container.encode(bedtime, forKey: .bedtime)
        try container.encode(workStartTime, forKey: .workStartTime)
        try container.encode(workEndTime, forKey: .workEndTime)
        try container.encode(workDays, forKey: .workDays)
        try container.encode(priorities, forKey: .priorities)
        try container.encode(focusSessionMinutes, forKey: .focusSessionMinutes)
        try container.encode(breakDurationMinutes, forKey: .breakDurationMinutes)
        try container.encode(planningStyle, forKey: .planningStyle)
        try container.encode(onboardingStep, forKey: .onboardingStep)
    }
}

/// The body of `PATCH /api/profile/routine`: the profile without the preferred name (Account owns it) and without the
/// web's place label. Every field is sent, the work hours as `null` when there are none.
public struct RoutineUpdate: Encodable, Equatable, Sendable {
    public var timeZone: String
    public var wakeUpTime: LocalTime
    public var bedtime: LocalTime
    public var workStartTime: LocalTime?
    public var workEndTime: LocalTime?
    public var workDays: [DayOfWeek]
    public var priorities: [String]
    public var focusSessionMinutes: Int
    public var breakDurationMinutes: Int
    public var planningStyle: PlanningStyle

    public init(
        timeZone: String, wakeUpTime: LocalTime, bedtime: LocalTime, workStartTime: LocalTime?, workEndTime: LocalTime?,
        workDays: [DayOfWeek], priorities: [String], focusSessionMinutes: Int, breakDurationMinutes: Int,
        planningStyle: PlanningStyle
    ) {
        self.timeZone = timeZone
        self.wakeUpTime = wakeUpTime
        self.bedtime = bedtime
        self.workStartTime = workStartTime
        self.workEndTime = workEndTime
        self.workDays = workDays
        self.priorities = priorities
        self.focusSessionMinutes = focusSessionMinutes
        self.breakDurationMinutes = breakDurationMinutes
        self.planningStyle = planningStyle
    }

    private enum CodingKeys: String, CodingKey {
        case timeZone, wakeUpTime, bedtime, workStartTime, workEndTime, workDays, priorities
        case focusSessionMinutes, breakDurationMinutes, planningStyle
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(timeZone, forKey: .timeZone)
        try container.encode(wakeUpTime, forKey: .wakeUpTime)
        try container.encode(bedtime, forKey: .bedtime)
        try container.encode(workStartTime, forKey: .workStartTime)
        try container.encode(workEndTime, forKey: .workEndTime)
        try container.encode(workDays, forKey: .workDays)
        try container.encode(priorities, forKey: .priorities)
        try container.encode(focusSessionMinutes, forKey: .focusSessionMinutes)
        try container.encode(breakDurationMinutes, forKey: .breakDurationMinutes)
        try container.encode(planningStyle, forKey: .planningStyle)
    }
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

extension Profile {
    /// What the server stores for a save, for tests and previews.
    public init(_ update: ProfileUpdate, completed: Bool, userId: String = "user-1", at date: Date = Date(timeIntervalSince1970: 0)) {
        self.init(
            userId: userId,
            preferredName: update.preferredName,
            timeZone: update.timeZone,
            wakeUpTime: update.wakeUpTime,
            bedtime: update.bedtime,
            workStartTime: update.workStartTime,
            workEndTime: update.workEndTime,
            workDays: update.workDays,
            priorities: update.priorities,
            focusSessionMinutes: update.focusSessionMinutes,
            breakDurationMinutes: update.breakDurationMinutes,
            planningStyle: update.planningStyle,
            onboardingStep: update.onboardingStep,
            onboardingCompleted: completed,
            createdAt: date,
            updatedAt: date
        )
    }

    public func completed() -> Profile {
        Profile(
            userId: userId, preferredName: preferredName, timeZone: timeZone, wakeUpTime: wakeUpTime, bedtime: bedtime,
            workStartTime: workStartTime, workEndTime: workEndTime, workDays: workDays, priorities: priorities,
            focusSessionMinutes: focusSessionMinutes, breakDurationMinutes: breakDurationMinutes,
            planningStyle: planningStyle, onboardingStep: 5, onboardingCompleted: true, createdAt: createdAt, updatedAt: updatedAt
        )
    }
}
