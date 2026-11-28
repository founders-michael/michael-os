import Foundation
import Models

/// The goal editor's fields. Limits mirror `goal-validation.ts`; the server checks them again.
struct GoalForm: Equatable {
    static let titleLimit = 160
    static let notesLimit = 5000
    static let categoryLimit = 80

    var title = ""
    var notes = ""
    var category = ""
    var targetDate: LocalDate?
    var progress = 0
    /// False for a completed goal: its progress is locked until it is reopened, and the server refuses a change.
    let editsProgress: Bool

    init() {
        editsProgress = true
    }

    init(_ goal: Goal) {
        title = goal.title
        notes = goal.description ?? ""
        category = goal.category ?? ""
        targetDate = goal.targetDate
        progress = goal.progress
        editsProgress = goal.status != .completed
    }

    var titleMissing: Bool { title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    /// The save, or nil while the form cannot be saved.
    var save: GoalSave? {
        guard !titleMissing else { return nil }
        return GoalSave(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines), description: Self.text(notes), category: Self.text(category),
            targetDate: targetDate, progress: editsProgress ? progress : nil)
    }

    private static func text(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

/// Michael's read on one active goal, mirrored from the web's `goalCoachRead` (`src/lib/goal-coach.ts`): fixed rules
/// over the goal's saved fields, never a model call.
struct GoalRead: Equatable {
    static let driftPoints = 10

    enum Standing: Equatable {
        case noMilestones
        /// Manual progress is this far from the milestone percentage; `ahead` when progress is the larger.
        case drift(ahead: Bool)
        case inStep
    }

    let standing: Standing
    let done: Int
    let total: Int
    let progress: Int
    /// Nil without milestones.
    let milestonePercent: Int?
    /// The first milestone not yet completed.
    let nextMilestone: String?
    let targetPassed: Bool

    init(_ goal: Goal, today: LocalDate) {
        total = goal.milestones.count
        done = goal.milestones.filter { $0.status == .completed }.count
        progress = goal.progress
        milestonePercent = total == 0 ? nil : Int((Double(done) / Double(total) * 100).rounded())
        nextMilestone = goal.milestones.first { $0.status != .completed }?.title
        targetPassed = goal.status == .active && goal.targetDate.map { $0 < today } == true
        standing =
            if let milestonePercent {
                abs(goal.progress - milestonePercent) >= Self.driftPoints ? .drift(ahead: goal.progress > milestonePercent) : .inStep
            } else {
                .noMilestones
            }
    }

    var progressDrift: Bool {
        if case .drift = standing { return true }
        return false
    }
}

/// When a goal is due, as the list and detail show it.
enum GoalTarget: Equatable {
    case none
    case passed(LocalDate)
    case today
    case inDays(Int)
    case onDate(LocalDate)

    /// Days are counted only for an active goal; a finished one just shows its date.
    static let countedDays = 14

    init(_ goal: Goal, today: LocalDate) {
        guard let target = goal.targetDate else {
            self = .none
            return
        }
        guard goal.status == .active else {
            self = .onDate(target)
            return
        }
        let days = today.days(until: target)
        self =
            switch days {
            case ..<0: .passed(target)
            case 0: .today
            case 1...Self.countedDays: .inDays(days)
            default: .onDate(target)
            }
    }
}

extension LocalDate {
    func days(until other: LocalDate) -> Int {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = PickerClock.timeZone
        return calendar.dateComponents([.day], from: PickerClock.date(self), to: PickerClock.date(other)).day ?? 0
    }
}
