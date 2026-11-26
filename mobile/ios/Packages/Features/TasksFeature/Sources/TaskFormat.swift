import Foundation
import Models

/// Server dates are calendar dates in the profile's zone, and the reminder instant is shown on that zone's clock, so
/// the device's own time zone never moves what the screen says.
enum TaskFormat {
    private static let utc = TimeZone(identifier: "UTC") ?? .gmt

    static func zone(_ identifier: String) -> TimeZone {
        TimeZone(identifier: identifier) ?? utc
    }

    /// "Fri 20 Nov"
    static func shortDate(_ date: LocalDate) -> String {
        PickerClock.date(date).formatted(Date.FormatStyle(timeZone: utc).weekday(.abbreviated).day().month(.abbreviated))
    }

    /// "Friday 20 November 2026"
    static func longDate(_ date: LocalDate) -> String {
        PickerClock.date(date).formatted(Date.FormatStyle(timeZone: utc).weekday(.wide).day().month(.wide).year())
    }

    static func due(_ task: Task, today: LocalDate?) -> String {
        guard let dueDate = task.dueDate else { return String(localized: "tasks.due.none", bundle: .module) }
        let date = shortDate(dueDate)
        if task.status != .completed, let today, dueDate < today {
            return String(localized: "tasks.due.overdue \(date)", bundle: .module)
        }
        if dueDate == today { return String(localized: "tasks.due.today", bundle: .module) }
        return String(localized: "tasks.due.on \(date)", bundle: .module)
    }

    static func isOverdue(_ task: Task, today: LocalDate?) -> Bool {
        guard task.status != .completed, let today, let dueDate = task.dueDate else { return false }
        return dueDate < today
    }

    static func minutes(_ value: Int) -> String {
        String(localized: "tasks.minutes \(value)", bundle: .module)
    }

    static func priority(_ priority: TaskPriority) -> String {
        switch priority {
        case .high: String(localized: "tasks.priority.high", bundle: .module)
        case .medium, .unknown: String(localized: "tasks.priority.medium", bundle: .module)
        case .low: String(localized: "tasks.priority.low", bundle: .module)
        }
    }

    static func status(_ status: TaskStatus) -> String {
        switch status {
        case .todo, .unknown: String(localized: "tasks.status.todo", bundle: .module)
        case .inProgress: String(localized: "tasks.status.inProgress", bundle: .module)
        case .completed: String(localized: "tasks.status.completed", bundle: .module)
        }
    }

    /// "Remind 08:30 · 27 Nov" on the profile's clock.
    static func reminder(_ instant: Date, in timeZone: TimeZone) -> String {
        let time = instant.formatted(Date.FormatStyle(date: .omitted, time: .shortened, timeZone: timeZone))
        let day = instant.formatted(Date.FormatStyle(timeZone: timeZone).day().month(.abbreviated))
        return String(localized: "tasks.reminder \(time) \(day)", bundle: .module)
    }

    /// The date and time an instant shows on the profile's clock, as the reminder fields hold them.
    static func clock(_ instant: Date, in timeZone: TimeZone) -> (LocalDate?, LocalTime?) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: instant)
        guard let year = parts.year, let month = parts.month, let day = parts.day, let hour = parts.hour,
            let minute = parts.minute
        else { return (nil, nil) }
        return (LocalDate(String(format: "%04d-%02d-%02d", year, month, day)), LocalTime(hour: hour, minute: minute))
    }

    static func weekdayName(_ weekday: Int) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = .current
        let symbols = calendar.shortWeekdaySymbols
        return symbols[weekday % 7]
    }

    /// ISO weekdays in the order the device's week starts.
    static var weekdaysInLocaleOrder: [Int] {
        let first = Calendar.current.firstWeekday
        return (0..<7).map { offset in ((first - 1 + offset + 6) % 7) + 1 }
    }

    /// The editor's preview of a repeat, worded on the device. Rows show the server's own `label`.
    static func repeatSummary(_ rule: RecurrenceRule) -> String {
        let base: String
        switch rule.frequency {
        case .daily, .unknown:
            base = String(localized: "tasks.repeat.summary.daily \(rule.interval)", bundle: .module)
        case .weekly:
            let days =
                rule.weekdays == [1, 2, 3, 4, 5]
                ? String(localized: "tasks.repeat.weekdaysOnly", bundle: .module)
                : rule.weekdays.map(weekdayName).formatted(.list(type: .and, width: .short))
            base =
                rule.interval == 1
                ? String(localized: "tasks.repeat.summary.weekly \(days)", bundle: .module)
                : String(localized: "tasks.repeat.summary.weeks \(rule.interval) \(days)", bundle: .module)
        case .monthly:
            let day = rule.monthDay ?? 1
            base =
                rule.interval == 1
                ? String(localized: "tasks.repeat.summary.monthly \(day)", bundle: .module)
                : String(localized: "tasks.repeat.summary.months \(rule.interval) \(day)", bundle: .module)
        }
        guard let endsOn = rule.endsOn else { return base }
        return String(localized: "tasks.repeat.summary.until \(base) \(shortDate(endsOn))", bundle: .module)
    }
}

extension AppError {
    init(_ error: any Error) {
        self = error as? AppError ?? .server(ServerMessage())
    }

    /// Shown in place of the list when nothing could be loaded.
    var loadMessage: String {
        switch self {
        case .offline: String(localized: "tasks.error.offline", bundle: .module)
        case .timeout: String(localized: "tasks.error.timeout", bundle: .module)
        case .forbidden(let server), .notFound(let server), .conflict(let server), .server(let server),
            .validation(let server, _), .unauthorized(let server), .rateLimited(let server, _):
            server.text ?? String(localized: "tasks.error.generic", bundle: .module)
        case .decoding: String(localized: "tasks.error.generic", bundle: .module)
        }
    }

    var isConnectionProblem: Bool {
        self == .offline || self == .timeout
    }

    /// The server's reason for refusing a change, when it gave one.
    var refusal: String? {
        switch self {
        case .forbidden(let server), .notFound(let server), .conflict(let server), .validation(let server, _): server.text
        case .offline, .timeout, .unauthorized, .rateLimited, .server, .decoding: nil
        }
    }
}
