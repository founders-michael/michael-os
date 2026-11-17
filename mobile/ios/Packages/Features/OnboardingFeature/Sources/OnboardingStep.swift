import Models

/// The five steps on the phone. The server's `onboardingStep` counts the web app's steps (0 welcome, 1 about
/// you, 2 routine, 3 priorities, 4 preferences, 5 review) and means "resume here", so a user can start on one
/// and finish on the other. The web's routine step holds both sleep and work hours.
public enum OnboardingStep: Int, CaseIterable, Comparable, Sendable {
    case name = 1
    case sleep
    case work
    case priorities
    case focus

    init(resumingAt serverStep: Int) {
        switch serverStep {
        case ...1: self = .name
        case 2: self = .sleep
        case 3: self = .priorities
        default: self = .focus
        }
    }

    /// Saved with this step's answers: where to resume once they are stored. The server allows completing
    /// onboarding only after 5 is saved.
    var serverStepAfter: Int {
        switch self {
        case .name, .sleep: 2
        case .work: 3
        case .priorities: 4
        case .focus: 5
        }
    }

    var next: OnboardingStep? { OnboardingStep(rawValue: rawValue + 1) }

    var previous: OnboardingStep? { OnboardingStep(rawValue: rawValue - 1) }

    /// The step that shows a field the server named in a 400.
    static func showing(field: String) -> OnboardingStep? {
        switch field {
        case "preferredName", "timeZone": .name
        case "wakeUpTime", "bedtime": .sleep
        case "workStartTime", "workEndTime", "workDays": .work
        case "priorities": .priorities
        case "focusSessionMinutes", "breakDurationMinutes", "planningStyle": .focus
        default: nil
        }
    }

    public static func < (lhs: OnboardingStep, rhs: OnboardingStep) -> Bool { lhs.rawValue < rhs.rawValue }
}
