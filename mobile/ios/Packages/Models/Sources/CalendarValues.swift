import Foundation

/// A `YYYY-MM-DD` calendar date in the profile's time zone. It is never converted to an instant.
public struct LocalDate: Hashable, Comparable, Sendable, Codable, CustomStringConvertible {
    public let year: Int
    public let month: Int
    public let day: Int

    public init?(_ text: String) {
        let parts = text.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
            let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]),
            (1...12).contains(month), (1...31).contains(day)
        else { return nil }
        self.year = year
        self.month = month
        self.day = day
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        let text = try container.decode(String.self)
        guard let date = LocalDate(text) else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected YYYY-MM-DD")
        }
        self = date
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(description)
    }

    public var description: String {
        String(format: "%04d-%02d-%02d", year, month, day)
    }

    public static func < (lhs: LocalDate, rhs: LocalDate) -> Bool {
        (lhs.year, lhs.month, lhs.day) < (rhs.year, rhs.month, rhs.day)
    }

    /// Calendar arithmetic on the date alone: no time zone or daylight saving change can move it.
    public func adding(days: Int) -> LocalDate {
        let calendar = Self.calendar
        guard let start = calendar.date(from: DateComponents(year: year, month: month, day: day)),
            let moved = calendar.date(byAdding: .day, value: days, to: start)
        else { return self }
        let parts = calendar.dateComponents([.year, .month, .day], from: moved)
        return LocalDate(year: parts.year ?? year, month: parts.month ?? month, day: parts.day ?? day)
    }

    /// ISO weekday, 1 = Monday to 7 = Sunday, as the server numbers them.
    public var weekday: Int {
        guard let date = Self.calendar.date(from: DateComponents(year: year, month: month, day: day)) else { return 1 }
        let sundayFirst = Self.calendar.component(.weekday, from: date)
        return sundayFirst == 1 ? 7 : sundayFirst - 1
    }

    private init(year: Int, month: Int, day: Int) {
        self.year = year
        self.month = month
        self.day = day
    }

    private static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        return calendar
    }()
}

/// An `HH:mm` wall-clock time in the profile's time zone.
public struct LocalTime: Hashable, Comparable, Sendable, Codable, CustomStringConvertible {
    public let hour: Int
    public let minute: Int

    /// Hours and minutes past the valid range wrap within the day.
    public init(hour: Int, minute: Int) {
        let total = ((hour * 60 + minute) % (24 * 60) + 24 * 60) % (24 * 60)
        self.hour = total / 60
        self.minute = total % 60
    }

    public init?(_ text: String) {
        let parts = text.split(separator: ":", omittingEmptySubsequences: false)
        guard parts.count == 2, parts[0].count == 2, parts[1].count == 2,
            let hour = Int(parts[0]), let minute = Int(parts[1]),
            (0...23).contains(hour), (0...59).contains(minute)
        else { return nil }
        self.hour = hour
        self.minute = minute
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.singleValueContainer()
        let text = try container.decode(String.self)
        guard let time = LocalTime(text) else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected HH:mm")
        }
        self = time
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(description)
    }

    public var description: String {
        String(format: "%02d:%02d", hour, minute)
    }

    public static func < (lhs: LocalTime, rhs: LocalTime) -> Bool {
        (lhs.hour, lhs.minute) < (rhs.hour, rhs.minute)
    }
}

/// An enum decoded from a server string. A value this build does not know decodes to `unknown`
/// instead of failing the whole response, so the web app can add values without breaking shipped apps.
public protocol OpenEnum: RawRepresentable, Codable, Hashable, Sendable where RawValue == String {
    static var unknown: Self { get }
}

extension OpenEnum {
    public init(from decoder: any Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Self(rawValue: raw) ?? .unknown
    }
}

extension JSONDecoder {
    /// Instants arrive as ISO 8601 with an offset, with or without fractional seconds.
    public static func api() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let text = try container.decode(String.self)
            for fractional in [true, false] {
                let style = Date.ISO8601FormatStyle(timeZoneSeparator: .colon, includingFractionalSeconds: fractional)
                if let date = try? style.parse(text) {
                    return date
                }
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected an ISO 8601 instant")
        }
        return decoder
    }
}

/// Calendar values on a UTC clock, for the system date and time pickers: with `timeZone` set on the picker, it
/// shows them as written whatever the device's zone.
public enum PickerClock {
    public static let timeZone = TimeZone(identifier: "UTC") ?? .gmt

    private static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        return calendar
    }

    public static func date(_ date: LocalDate) -> Date {
        calendar.date(from: DateComponents(year: date.year, month: date.month, day: date.day, hour: 12)) ?? .now
    }

    public static func date(_ time: LocalTime) -> Date {
        calendar.date(from: DateComponents(year: 2001, month: 1, day: 1, hour: time.hour, minute: time.minute)) ?? .now
    }

    public static func localDate(_ date: Date) -> LocalDate {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        let text = String(format: "%04d-%02d-%02d", parts.year ?? 2000, parts.month ?? 1, parts.day ?? 1)
        return LocalDate(text) ?? today(in: "UTC")
    }

    public static func localTime(_ date: Date) -> LocalTime {
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return LocalTime(hour: parts.hour ?? 0, minute: parts.minute ?? 0)
    }

    /// Only a starting value for a picker the user then sets: the server's date rules everything else.
    public static func today(in zone: String) -> LocalDate {
        var zoned = Calendar(identifier: .gregorian)
        zoned.timeZone = TimeZone(identifier: zone) ?? .current
        let parts = zoned.dateComponents([.year, .month, .day], from: .now)
        let text = String(format: "%04d-%02d-%02d", parts.year ?? 2000, parts.month ?? 1, parts.day ?? 1)
        return LocalDate(text) ?? localDate(.now)
    }
}
