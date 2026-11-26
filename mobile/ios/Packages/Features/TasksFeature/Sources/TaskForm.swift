import Foundation
import Models

/// The task editor's fields. Limits mirror `task-validation.ts`; the server checks them again.
struct TaskForm: Equatable {
    static let titleLimit = 160
    static let notesLimit = 5000
    static let minutes = 5...1440

    var title = ""
    var notes = ""
    var priority = TaskPriority.medium
    var dueDate: LocalDate?
    /// Digits as typed, so "4" can be on its way to "45" without an error.
    var estimate = ""
    var remaining = ""
    var repeatRule = RepeatDraft()
    var reminderDate: LocalDate?
    var reminderTime: LocalTime?

    init() {}

    /// The form for an existing task. A reminder already sent starts empty, so a new one can be set.
    init(_ task: Task, timeZone: TimeZone) {
        title = task.title
        notes = task.description ?? ""
        priority = task.priority == .unknown ? .medium : task.priority
        dueDate = task.dueDate
        estimate = task.estimatedDurationMinutes.map(String.init) ?? ""
        remaining = task.remainingDurationMinutes.map(String.init) ?? ""
        repeatRule = RepeatDraft(task.activeRecurrence)
        if let remindAt = task.remindAt, !task.reminderSent {
            (reminderDate, reminderTime) = TaskFormat.clock(remindAt, in: timeZone)
        }
    }

    enum Field: String, CaseIterable {
        case title, description, estimatedDurationMinutes, remainingDurationMinutes, dueDate, recurrence, reminder
    }

    enum Problem: Equatable {
        case titleMissing, minutesOutOfRange, repeatNeedsDueDate, repeatNeedsWeekday, endsBeforeDueDate, reminderHalfSet
    }

    /// What is wrong before anything is sent, by field. Empty when the form can be saved.
    var problems: [Field: Problem] {
        var problems: [Field: Problem] = [:]
        if title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { problems[.title] = .titleMissing }
        if !Self.isValidMinutes(estimate) { problems[.estimatedDurationMinutes] = .minutesOutOfRange }
        if !Self.isValidMinutes(remaining) { problems[.remainingDurationMinutes] = .minutesOutOfRange }
        if let rule = repeatRule.rule(dueDate: dueDate) {
            if dueDate == nil {
                problems[.recurrence] = .repeatNeedsDueDate
            } else if rule.frequency == .weekly && rule.weekdays.isEmpty {
                problems[.recurrence] = .repeatNeedsWeekday
            } else if let ends = rule.endsOn, let dueDate, ends < dueDate {
                problems[.recurrence] = .endsBeforeDueDate
            }
        }
        if (reminderDate == nil) != (reminderTime == nil) { problems[.reminder] = .reminderHalfSet }
        return problems
    }

    /// The save, or nil while the form has problems. The repeat and the reminder are sent only when they differ from
    /// what the task had (`saved`), as the web form does.
    func save(comparedWith saved: TaskForm?) -> TaskSave? {
        guard problems.isEmpty else { return nil }
        let rule = repeatRule.rule(dueDate: dueDate)
        let savedRule = saved.flatMap { $0.repeatRule.rule(dueDate: $0.dueDate) }
        let recurrence: FieldChange<RecurrenceRule>? =
            if rule == savedRule { nil } else if let rule { .set(rule) } else { .clear }
        let reminder: FieldChange<ReminderTime>?
        let savedReminder = saved.flatMap(\.reminderValue)
        if reminderValue == savedReminder {
            reminder = nil
        } else if let value = reminderValue {
            reminder = .set(value)
        } else {
            reminder = .clear
        }
        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        return TaskSave(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines),
            description: trimmedNotes.isEmpty ? nil : trimmedNotes,
            priority: priority,
            estimatedDurationMinutes: Int(estimate),
            remainingDurationMinutes: Int(remaining),
            dueDate: dueDate,
            recurrence: recurrence,
            reminder: reminder
        )
    }

    private var reminderValue: ReminderTime? {
        guard let reminderDate, let reminderTime else { return nil }
        return ReminderTime(date: reminderDate, time: reminderTime)
    }

    private static func isValidMinutes(_ text: String) -> Bool {
        text.isEmpty || Int(text).map(minutes.contains) == true
    }
}

/// The Repeat field: presets for the common cases, Custom for the rest (`recurrence-form.ts`). Presets take their
/// day from the due date.
struct RepeatDraft: Equatable {
    enum Preset: CaseIterable {
        case none, daily, weekdays, weekly, monthly, custom
    }

    static let intervals = 1...99
    static let monthDays = 1...31

    var preset = Preset.none
    var frequency = RecurrenceFrequency.weekly
    var interval = 1
    var weekdays: Set<Int> = []
    var monthDay = 1
    var endsOn: LocalDate?

    init() {}

    /// The closest preset for a saved repeat, or Custom.
    init(_ recurrence: TaskRecurrence?) {
        guard let recurrence else { return }
        frequency = recurrence.frequency
        interval = recurrence.interval
        weekdays = Set(recurrence.weekdays)
        monthDay = recurrence.monthDay ?? 1
        endsOn = recurrence.endsOn
        preset =
            if recurrence.endsOn != nil || recurrence.interval != 1 {
                .custom
            } else {
                switch recurrence.frequency {
                case .daily: .daily
                case .monthly: .monthly
                case .weekly where recurrence.weekdays == [1, 2, 3, 4, 5]: .weekdays
                case .weekly where recurrence.weekdays.count == 1: .weekly
                case .weekly, .unknown: .custom
                }
            }
    }

    func rule(dueDate: LocalDate?) -> RecurrenceRule? {
        switch preset {
        case .none:
            return nil
        case .daily:
            return RecurrenceRule(frequency: .daily, interval: 1, weekdays: [], monthDay: nil, endsOn: nil)
        case .weekdays:
            return RecurrenceRule(frequency: .weekly, interval: 1, weekdays: [1, 2, 3, 4, 5], monthDay: nil, endsOn: nil)
        case .weekly:
            return RecurrenceRule(frequency: .weekly, interval: 1, weekdays: dueDate.map { [$0.weekday] } ?? [], monthDay: nil, endsOn: nil)
        case .monthly:
            return RecurrenceRule(frequency: .monthly, interval: 1, weekdays: [], monthDay: dueDate?.day ?? 1, endsOn: nil)
        case .custom:
            let frequency = frequency == .unknown ? .weekly : frequency
            return RecurrenceRule(
                frequency: frequency,
                interval: min(max(interval, Self.intervals.lowerBound), Self.intervals.upperBound),
                weekdays: frequency == .weekly ? Array(weekdays) : [],
                monthDay: frequency == .monthly ? monthDay : nil,
                endsOn: endsOn
            )
        }
    }
}
