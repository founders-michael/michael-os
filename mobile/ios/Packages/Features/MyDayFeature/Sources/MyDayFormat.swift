import Foundation
import Models

/// Server dates are calendar dates in the profile's zone, and instants are shown on that zone's clock, so the
/// device's own time zone never moves what the screen says.
enum MyDayFormat {
    private static let utc = TimeZone(identifier: "UTC") ?? .gmt

    static func date(_ date: LocalDate) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        let anchor = calendar.date(from: DateComponents(year: date.year, month: date.month, day: date.day, hour: 12)) ?? .distantPast
        return anchor.formatted(Date.FormatStyle(timeZone: utc).weekday(.wide).day().month(.wide))
    }

    static func time(_ instant: Date, in timeZone: String) -> String {
        instant.formatted(Date.FormatStyle(date: .omitted, time: .shortened, timeZone: zone(timeZone)))
    }

    static func timeRange(_ start: Date, _ end: Date, in timeZone: String) -> String {
        "\(time(start, in: timeZone)) – \(time(end, in: timeZone))"
    }

    private static func zone(_ identifier: String) -> TimeZone {
        TimeZone(identifier: identifier) ?? .current
    }
}

extension AppError {
    /// Shown in place of the day when nothing could be loaded.
    var loadMessage: String {
        switch self {
        case .offline: String(localized: "myDay.error.offline", bundle: .module)
        case .timeout: String(localized: "myDay.error.timeout", bundle: .module)
        case .forbidden(let server), .notFound(let server), .conflict(let server), .server(let server),
            .validation(let server, _), .unauthorized(let server), .rateLimited(let server, _):
            server.text ?? String(localized: "myDay.error.generic", bundle: .module)
        case .decoding: String(localized: "myDay.error.generic", bundle: .module)
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

extension MyDayRollback {
    var message: String {
        let fallback =
            switch action {
            case .complete: String(localized: "myDay.rollback.complete", bundle: .module)
            case .reopen: String(localized: "myDay.rollback.reopen", bundle: .module)
            case .checkIn: String(localized: "myDay.rollback.checkIn", bundle: .module)
            case .undoCheckIn: String(localized: "myDay.rollback.undoCheckIn", bundle: .module)
            }
        guard let reason = error.refusal else { return fallback }
        return String(localized: "myDay.rollback.reason \(fallback) \(reason)", bundle: .module)
    }
}
