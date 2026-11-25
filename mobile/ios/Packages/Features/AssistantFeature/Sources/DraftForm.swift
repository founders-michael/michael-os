import Foundation
import Models

// Mirrors the web app's src/lib/ai/draft-model.ts, the one definition of what Michael may propose: the fields of
// each kind, the defaults the create schemas apply, which required fields are still empty, and the exact body the
// kind's create endpoint takes. The endpoint's own schema stays the authority on save.

struct DraftOption: Equatable {
    let value: String
    let label: String
}

struct DraftField: Equatable {
    enum Input: Equatable {
        case text(maxLength: Int)
        case longText(maxLength: Int)
        case choice([DraftOption])
        case date
        case time
        case number(min: Int, max: Int, unit: String?)
        case weekdays
    }

    let name: String
    let label: String
    let required: Bool
    let input: Input
}

/// The record the user's Save posts, one case per create endpoint.
enum DraftSubmission: Equatable {
    case task(TaskCreate)
    case goal(GoalCreate)
    case habit(HabitCreate)
    case calendarEvent(CalendarEventCreate)
    case memory(MemoryCreate)
}

struct DraftForm: Equatable {
    let kind: DraftKind
    let timeZone: String
    private(set) var values: [String: DraftValue]

    init(_ draft: RecordDraft) {
        kind = draft.kind
        timeZone = draft.timeZone
        values = Self.defaults(draft.kind).merging(draft.values) { _, proposed in proposed }
        // A daily habit takes no weekdays; the create schema refuses them.
        if kind == .habit, values["frequency"] != .text("SELECTED_DAYS") { values["weekdays"] = .days([]) }
    }

    /// The fields to show. A daily habit has no days to choose, so that field is withheld rather than ignored.
    var fields: [DraftField] {
        let all = Self.specs(kind)
        guard kind == .habit, values["frequency"] != .text("SELECTED_DAYS") else { return all }
        return all.filter { $0.name != "weekdays" }
    }

    /// Required fields still empty, with the conditional requirement the habit schema adds.
    var missing: [String] {
        var missing = fields.filter { $0.required && isBlank(values[$0.name]) }.map(\.name)
        if kind == .habit, values["frequency"] == .text("SELECTED_DAYS"), isBlank(values["weekdays"]) {
            missing.append("weekdays")
        }
        return missing
    }

    mutating func set(_ name: String, to value: DraftValue?) {
        values[name] = value
        if name == "frequency", kind == .habit, value != .text("SELECTED_DAYS") { values["weekdays"] = .days([]) }
    }

    func text(_ name: String) -> String {
        if case .text(let text) = values[name] { return text }
        return ""
    }

    func number(_ name: String) -> Int? {
        if case .number(let number) = values[name] { return number }
        return nil
    }

    func days(_ name: String) -> [Int] {
        if case .days(let days) = values[name] { return days }
        return []
    }

    /// Nil while a required field is empty, so a half-filled draft cannot be posted, and for an event that does
    /// not end after it starts or names a wall-clock time the time zone skips.
    var submission: DraftSubmission? {
        guard missing.isEmpty else { return nil }
        switch kind {
        case .task:
            return .task(
                TaskCreate(
                    title: trimmed("title") ?? "",
                    description: trimmed("description"),
                    priority: TaskPriority(rawValue: text("priority")) ?? .medium,
                    dueDate: LocalDate(text("dueDate")),
                    estimatedDurationMinutes: number("estimatedDurationMinutes")
                )
            )
        case .goal:
            return .goal(
                GoalCreate(
                    title: trimmed("title") ?? "",
                    description: trimmed("description"),
                    category: trimmed("category"),
                    targetDate: LocalDate(text("targetDate")),
                    progress: number("progress") ?? 0
                )
            )
        case .habit:
            return .habit(habitSubmission)
        case .calendarEvent:
            return calendarSubmission.map(DraftSubmission.calendarEvent)
        case .memory:
            return .memory(
                MemoryCreate(
                    content: trimmed("content") ?? "",
                    sensitivity: MemorySensitivity(rawValue: text("sensitivity")) ?? .standard,
                    keepUntil: LocalDate(text("keepUntil"))
                )
            )
        case .unknown:
            return nil
        }
    }

    private var habitSubmission: HabitCreate {
        let selectedDays = text("frequency") == "SELECTED_DAYS"
        let start = LocalTime(text("startTime"))
        let end = LocalTime(text("endTime"))
        return HabitCreate(
            title: trimmed("title") ?? "",
            description: trimmed("description"),
            frequency: selectedDays ? .selectedDays : .daily,
            weekdays: selectedDays ? days("weekdays") : [],
            startTime: start,
            // An end time is only valid with a start time, and one equal to the start means none.
            endTime: start != nil && end != start ? end : nil
        )
    }

    private var calendarSubmission: CalendarEventCreate? {
        guard let date = LocalDate(text("date")),
            let start = LocalTime(text("startTime")).flatMap({ Self.instant(date, $0, in: timeZone) }),
            let end = LocalTime(text("endTime")).flatMap({ Self.instant(date, $0, in: timeZone) }),
            start < end
        else { return nil }
        return CalendarEventCreate(
            title: trimmed("title") ?? "",
            description: trimmed("description"),
            eventType: CalendarEventType(rawValue: text("eventType")) ?? .commitment,
            startAt: start,
            endAt: end,
            timeZone: timeZone
        )
    }

    private func trimmed(_ name: String) -> String? {
        let value = text(name).trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }

    private func isBlank(_ value: DraftValue?) -> Bool {
        switch value {
        case nil: true
        case .text(let text): text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .days(let days): days.isEmpty
        case .number: false
        }
    }

    /// The instant a wall-clock time on a date has in `zone`; nil when a clock change skips that time.
    static func instant(_ date: LocalDate, _ time: LocalTime, in zone: String) -> Date? {
        guard let timeZone = TimeZone(identifier: zone) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let wanted = DateComponents(year: date.year, month: date.month, day: date.day, hour: time.hour, minute: time.minute)
        guard let instant = calendar.date(from: wanted) else { return nil }
        let landed = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: instant)
        let exists =
            landed.year == date.year && landed.month == date.month && landed.day == date.day
            && landed.hour == time.hour && landed.minute == time.minute
        return exists ? instant : nil
    }

    /// Server field names on a 400, as the form's fields: an event's instants are entered as times.
    static func field(forServerField name: String) -> String {
        switch name {
        case "startAt": "startTime"
        case "endAt": "endTime"
        default: name
        }
    }
}
