import Foundation
import Models

/// The answers so far. Every save sends all of them, since the server validates the whole profile each time.
public struct OnboardingDraft: Equatable, Sendable {
    static let nameLimit = 80
    static let priorityLimit = 3
    static let priorityLength = 100
    static let focusRange = 15...180
    static let breakRange = 0...60
    static let minuteStep = 5
    static let suggestedPriorities = ["Health", "Family", "Career", "Learning", "Money", "Friends"]
    // Shown when the work hours are first offered; the server stores none until the user continues.
    static let defaultWorkStart = LocalTime(hour: 9, minute: 0)
    static let defaultWorkEnd = LocalTime(hour: 18, minute: 0)

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

    /// The web app's defaults for a new profile (`defaultProfileFormData`), with the phone's time zone.
    static func initial(name: String, timeZone: String) -> OnboardingDraft {
        OnboardingDraft(
            preferredName: name,
            timeZone: timeZone,
            wakeUpTime: LocalTime(hour: 7, minute: 0),
            bedtime: LocalTime(hour: 22, minute: 30),
            workStartTime: nil,
            workEndTime: nil,
            workDays: [.monday, .tuesday, .wednesday, .thursday, .friday],
            priorities: [],
            focusSessionMinutes: 50,
            breakDurationMinutes: 10,
            planningStyle: .balanced
        )
    }

    init(
        preferredName: String, timeZone: String, wakeUpTime: LocalTime, bedtime: LocalTime, workStartTime: LocalTime?,
        workEndTime: LocalTime?, workDays: [DayOfWeek], priorities: [String], focusSessionMinutes: Int,
        breakDurationMinutes: Int, planningStyle: PlanningStyle
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
    }

    init(_ profile: Profile) {
        self.init(
            preferredName: profile.preferredName,
            timeZone: profile.timeZone,
            wakeUpTime: profile.wakeUpTime,
            bedtime: profile.bedtime,
            workStartTime: profile.workStartTime,
            workEndTime: profile.workEndTime,
            workDays: profile.workDays.filter { $0 != .unknown },
            priorities: profile.priorities,
            focusSessionMinutes: profile.focusSessionMinutes,
            breakDurationMinutes: profile.breakDurationMinutes,
            planningStyle: profile.planningStyle == .unknown ? .balanced : profile.planningStyle
        )
    }

    func update(onboardingStep: Int) -> ProfileUpdate {
        ProfileUpdate(
            preferredName: preferredName.trimmingCharacters(in: .whitespacesAndNewlines),
            timeZone: timeZone,
            wakeUpTime: wakeUpTime,
            bedtime: bedtime,
            workStartTime: workStartTime,
            workEndTime: workEndTime,
            workDays: DayOfWeek.week.filter(workDays.contains),
            priorities: priorities,
            focusSessionMinutes: focusSessionMinutes,
            breakDurationMinutes: breakDurationMinutes,
            planningStyle: planningStyle,
            onboardingStep: onboardingStep
        )
    }

    /// Minutes awake between wake-up and bedtime. A bedtime before the wake-up time is after midnight.
    var awakeMinutes: Int {
        let minutes = bedtime.minutesSinceMidnight - wakeUpTime.minutesSinceMidnight
        return minutes > 0 ? minutes : minutes + 24 * 60
    }
}

extension DayOfWeek {
    static let week: [DayOfWeek] = [.monday, .tuesday, .wednesday, .thursday, .friday, .saturday, .sunday]
}

extension LocalTime {
    var minutesSinceMidnight: Int { hour * 60 + minute }
}
