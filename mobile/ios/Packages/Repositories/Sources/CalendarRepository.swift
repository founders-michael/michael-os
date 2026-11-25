import Models
import Networking

/// Every call throws `AppError` or `CancellationError`.
public protocol CalendarRepository: Sendable {
    /// Refused with `conflict` when the event overlaps another.
    func create(_ event: CalendarEventCreate) async throws -> CalendarEvent
}

public struct RemoteCalendarRepository: CalendarRepository {
    private let client: APIClient

    public init(client: APIClient) {
        self.client = client
    }

    public func create(_ event: CalendarEventCreate) async throws -> CalendarEvent {
        try await client.send(APIRequest<CalendarEventResponse>.post("/api/calendar/events", body: event)).value.event
    }
}
