import Models
import Networking

/// Every call throws `AppError` or `CancellationError`.
public protocol CalendarRepository: Sendable {
    /// Refused with `conflict` when the event overlaps another.
    func create(_ event: CalendarEventCreate) async throws -> CalendarEvent
    func availability() async throws -> Availability
    /// Replaces the whole weekly set.
    func saveAvailability(_ update: AvailabilityUpdate) async throws -> Availability
}

public struct RemoteCalendarRepository: CalendarRepository {
    private let client: APIClient

    public init(client: APIClient) {
        self.client = client
    }

    public func create(_ event: CalendarEventCreate) async throws -> CalendarEvent {
        try await client.send(APIRequest<CalendarEventResponse>.post("/api/calendar/events", body: event)).value.event
    }

    public func availability() async throws -> Availability {
        try await client.send(APIRequest<Availability>.get("/api/calendar/availability")).value
    }

    public func saveAvailability(_ update: AvailabilityUpdate) async throws -> Availability {
        try await client.send(APIRequest<Availability>.put("/api/calendar/availability", body: update)).value
    }
}
