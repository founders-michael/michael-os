import Foundation
import Models

/// Times are on the profile's clock; dates are calendar dates shown on a UTC clock so no zone shifts them.
enum CalendarFormat {
    static func time(_ instant: Date, _ clock: ZonedClock) -> String {
        instant.formatted(Date.FormatStyle(date: .omitted, time: .shortened, timeZone: clock.timeZone))
    }

    static func range(_ start: Date, _ end: Date, _ clock: ZonedClock) -> String {
        "\(time(start, clock)) – \(time(end, clock))"
    }

    static func time(_ time: LocalTime) -> String {
        PickerClock.date(time).formatted(Date.FormatStyle(date: .omitted, time: .shortened, timeZone: PickerClock.timeZone))
    }

    static func month(_ date: LocalDate) -> String {
        PickerClock.date(date).formatted(Date.FormatStyle(timeZone: PickerClock.timeZone).month(.wide).year())
    }

    static func dayTitle(_ date: LocalDate) -> String {
        PickerClock.date(date).formatted(Date.FormatStyle(timeZone: PickerClock.timeZone).weekday(.wide).day())
    }

    static func weekdayShort(_ date: LocalDate) -> String {
        PickerClock.date(date).formatted(Date.FormatStyle(timeZone: PickerClock.timeZone).weekday(.abbreviated))
    }

    static func dayNumber(_ date: LocalDate) -> String { "\(date.day)" }

    static func fullDate(_ date: LocalDate) -> String {
        PickerClock.date(date).formatted(
            Date.FormatStyle(timeZone: PickerClock.timeZone).weekday(.abbreviated).day().month(.abbreviated).year())
    }

    static func shortDate(_ date: LocalDate) -> String {
        PickerClock.date(date).formatted(Date.FormatStyle(timeZone: PickerClock.timeZone).weekday(.abbreviated).day().month(.abbreviated))
    }

    /// "Sun 29 Nov · 9:00 AM – 10:30 AM" for a session that may fall on any day of the plan.
    static func session(_ start: Date, _ end: Date, _ clock: ZonedClock) -> String {
        "\(shortDate(clock.date(of: start))) · \(range(start, end, clock))"
    }

    static func hour(_ hour: Int) -> String {
        time(LocalTime(hour: hour, minute: 0))
    }

    static func kind(_ kind: EventKind) -> String {
        switch kind {
        case .commitment: String(localized: "calendar.kind.commitment", bundle: .module)
        case .unavailable: String(localized: "calendar.kind.unavailable", bundle: .module)
        case .session: String(localized: "calendar.kind.session", bundle: .module)
        }
    }

    static func kindHelp(_ kind: EventKind) -> String {
        switch kind {
        case .commitment: String(localized: "calendar.kind.commitment.help", bundle: .module)
        case .unavailable: String(localized: "calendar.kind.unavailable.help", bundle: .module)
        case .session: String(localized: "calendar.kind.session.help", bundle: .module)
        }
    }

    static func message(_ error: AppError) -> String {
        switch error {
        case .offline: String(localized: "calendar.error.offline", bundle: .module)
        case .timeout: String(localized: "calendar.error.timeout", bundle: .module)
        case .forbidden(let server), .notFound(let server), .conflict(let server), .server(let server), .validation(let server, _),
            .unauthorized(let server), .rateLimited(let server, _):
            server.text ?? String(localized: "calendar.error.generic", bundle: .module)
        case .decoding: String(localized: "calendar.error.generic", bundle: .module)
        }
    }

    static func planProblem(_ problem: PlanProblem) -> String {
        switch problem {
        case .stale(let text): text ?? String(localized: "calendar.plan.stale", bundle: .module)
        case .refused(let text): text ?? String(localized: "calendar.plan.refused", bundle: .module)
        case .unavailable(let error):
            switch error {
            case .offline, .timeout: message(error)
            default: String(localized: "calendar.plan.unavailable", bundle: .module)
            }
        }
    }
}
