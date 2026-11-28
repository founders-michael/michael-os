import Foundation

/// One weekly window Michael may plan in, on the clock of `timeZone`. Start is before end: no window crosses midnight.
public struct AvailabilityWindow: Codable, Equatable, Sendable {
    /// Nil for a window the server has not stored yet; its `PUT` answers those with an empty id.
    public var id: String?
    /// ISO weekday, 1 = Monday to 7 = Sunday.
    public var weekday: Int
    public var startTime: LocalTime
    public var endTime: LocalTime
    public var timeZone: String
    public var active: Bool

    public init(id: String? = nil, weekday: Int, startTime: LocalTime, endTime: LocalTime, timeZone: String, active: Bool = true) {
        self.id = id
        self.weekday = weekday
        self.startTime = startTime
        self.endTime = endTime
        self.timeZone = timeZone
        self.active = active
    }

    private enum CodingKeys: String, CodingKey { case id, weekday, startTime, endTime, timeZone, active }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let id = try container.decodeIfPresent(String.self, forKey: .id)
        self.id = id?.isEmpty == false ? id : nil
        weekday = try container.decode(Int.self, forKey: .weekday)
        startTime = try container.decode(LocalTime.self, forKey: .startTime)
        endTime = try container.decode(LocalTime.self, forKey: .endTime)
        timeZone = try container.decode(String.self, forKey: .timeZone)
        active = try container.decode(Bool.self, forKey: .active)
    }
}

/// `GET` / `PUT /api/calendar/availability`. `configured` is true when any window is active.
public struct Availability: Decodable, Equatable, Sendable {
    public let timeZone: String
    public let configured: Bool
    public let windows: [AvailabilityWindow]

    public init(timeZone: String, configured: Bool, windows: [AvailabilityWindow]) {
        self.timeZone = timeZone
        self.configured = configured
        self.windows = windows
    }
}

/// The whole weekly set; the server replaces what it had with it.
public struct AvailabilityUpdate: Encodable, Equatable, Sendable {
    public let windows: [AvailabilityWindow]

    public init(windows: [AvailabilityWindow]) {
        self.windows = windows
    }
}
