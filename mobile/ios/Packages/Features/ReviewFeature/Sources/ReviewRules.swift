import Foundation
import Models

/// The reflection as the screen edits it: five texts and the tasks marked intentionally skipped.
struct ReflectionDraft: Equatable {
    static let textLimit = 10_000

    enum Field: CaseIterable {
        case wentWell, challenges, blockers, lessonsLearned, improvements
    }

    private var texts: [Field: String] = [:]
    private(set) var skipped: [String] = []

    init(_ stored: StoredReflection? = nil) {
        guard let stored else { return }
        texts = [
            .wentWell: stored.wentWell, .challenges: stored.challenges, .blockers: stored.blockers,
            .lessonsLearned: stored.lessonsLearned, .improvements: stored.improvements,
        ]
        skipped = stored.intentionallySkippedTaskIds
    }

    subscript(field: Field) -> String {
        get { texts[field] ?? "" }
        set { texts[field] = String(newValue.prefix(Self.textLimit)) }
    }

    func isSkipped(_ task: String) -> Bool { skipped.contains(task) }

    mutating func toggleSkipped(_ task: String) {
        if let index = skipped.firstIndex(of: task) { skipped.remove(at: index) } else { skipped.append(task) }
    }

    /// Built field by field: nothing the server stored beside the reflection can reach the save.
    func save(for date: LocalDate) -> ReflectionSave {
        ReflectionSave(
            date: date, wentWell: self[.wentWell], challenges: self[.challenges], blockers: self[.blockers],
            lessonsLearned: self[.lessonsLearned], improvements: self[.improvements], intentionallySkippedTaskIds: skipped)
    }
}

/// Where the reflection stands against the server.
enum SaveState: Equatable {
    case saved, unsaved, saving
    /// The text stays on screen; the next edit tries again.
    case failed(AppError)
}

/// Moving a missed task to another day. Rules mirror `carryForwardReviewTaskSchema` and the service; the server checks
/// them again, along with availability and calendar conflicts.
struct CarryForwardForm: Equatable {
    var date: LocalDate
    var startTime: LocalTime?
    var endTime: LocalTime?

    enum Problem: Equatable {
        case tooEarly, oneTime, endNotAfterStart
    }

    /// The first day a task from this review may move to: after the review date, and not before today.
    static func earliest(review: LocalDate, today: LocalDate) -> LocalDate {
        max(review.adding(days: 1), today)
    }

    func problem(review: LocalDate, today: LocalDate) -> Problem? {
        if date < Self.earliest(review: review, today: today) { return .tooEarly }
        if (startTime == nil) != (endTime == nil) { return .oneTime }
        if let startTime, let endTime, endTime <= startTime { return .endNotAfterStart }
        return nil
    }
}

/// What happened to a missed task on this screen since the review was read.
enum Moved: Equatable {
    case date(LocalDate)
    case unscheduled
}

/// Michael's line on the review, mirrored from the web's `reviewLine` (`daily-review.tsx`).
enum ReviewLine: Equatable {
    case nothingPlanned
    case completed(done: Int, planned: Int, percent: Int, open: Int)

    init(_ review: DailyReview) {
        let overview = review.overview
        self =
            overview.planned == 0
            ? .nothingPlanned
            : .completed(
                done: overview.completed, planned: overview.planned, percent: overview.completionPercent, open: review.missedTasks.count)
    }
}
