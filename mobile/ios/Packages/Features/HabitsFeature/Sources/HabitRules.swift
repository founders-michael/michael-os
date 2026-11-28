import Foundation
import Models

/// A habit's schedule as the editor holds it: daily or chosen weekdays, and an optional start and end time. Rules
/// mirror `habit-validation.ts`; the server checks them again.
struct HabitSchedule: Equatable {
    var frequency = HabitFrequency.daily
    var weekdays: Set<Int> = []
    var startTime: LocalTime?
    var endTime: LocalTime?

    enum Problem: Equatable {
        case noWeekday, endWithoutStart, endEqualsStart
    }

    var problem: Problem? {
        if frequency == .selectedDays && weekdays.isEmpty { return .noWeekday }
        if endTime != nil && startTime == nil { return .endWithoutStart }
        if let endTime, endTime == startTime { return .endEqualsStart }
        return nil
    }

    /// An end earlier than the start runs past midnight, as in sleeping 23:00 to 07:00.
    var runsPastMidnight: Bool {
        guard let startTime, let endTime else { return false }
        return endTime < startTime
    }
}

/// The habit editor's fields.
struct HabitForm: Equatable {
    static let titleLimit = 160
    static let notesLimit = 2000

    var title = ""
    var notes = ""
    var schedule = HabitSchedule()

    init() {}

    init(_ habit: Habit) {
        title = habit.title
        notes = habit.description ?? ""
        schedule = HabitSchedule(
            frequency: habit.frequency == .unknown ? .daily : habit.frequency, weekdays: Set(habit.weekdays),
            startTime: habit.startTime, endTime: habit.endTime)
    }

    var titleMissing: Bool { title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    /// The save, or nil while the form cannot be saved.
    var save: HabitSave? {
        guard !titleMissing, schedule.problem == nil else { return nil }
        let notes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        return HabitSave(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines), description: notes.isEmpty ? nil : notes,
            frequency: schedule.frequency, weekdays: schedule.frequency == .daily ? [] : Array(schedule.weekdays),
            startTime: schedule.startTime, endTime: schedule.endTime)
    }
}

/// Michael's line on the Habits screen, mirrored from the web's `habitLine` (`habit-manager.tsx`): a rule over saved
/// data, never a model call.
struct HabitLine: Equatable {
    enum Kind: Equatable {
        /// The active habit due today with the longest streak, and what a check-in today would do.
        case next(Habit)
        case allDone
        case nothingToday
    }

    let kind: Kind

    /// Nil when there is no active habit.
    init?(_ habits: [Habit]) {
        let active = habits.filter { $0.status == .active }
        guard !active.isEmpty else { return nil }
        let due = active.filter { $0.todayScheduled && !$0.completedToday }.sorted { $0.currentStreak > $1.currentStreak }
        if let next = due.first {
            kind = .next(next)
        } else {
            kind = active.contains { $0.todayScheduled } ? .allDone : .nothingToday
        }
    }

    enum Record: Equatable {
        case best, matchesBest, none
    }

    /// Where a check-in today would put the streak against the best one.
    static func record(_ habit: Habit) -> Record {
        let next = habit.currentStreak + 1
        if next > habit.bestStreak { return .best }
        return next == habit.bestStreak ? .matchesBest : .none
    }
}
