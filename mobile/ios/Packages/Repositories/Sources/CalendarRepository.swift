import Foundation
import Models
import Networking

/// Every call throws `AppError` or `CancellationError`.
public protocol CalendarRepository: Sendable {
    /// Every event overlapping `start` to `end`, at most 46 days apart.
    func events(from start: Date, until end: Date) async throws -> CalendarEventsPage
    /// Refused with `conflict` when the event overlaps another; the message carries the overlapped events.
    func create(_ event: CalendarEventCreate) async throws -> CalendarEvent
    /// Refused as `create` is.
    func update(_ id: CalendarEvent.ID, _ change: CalendarEventUpdate) async throws -> CalendarEvent
    func delete(event id: CalendarEvent.ID) async throws
    func unscheduledTasks() async throws -> [UnscheduledTask]
    func availability() async throws -> Availability
    /// Replaces the whole weekly set.
    func saveAvailability(_ update: AvailabilityUpdate) async throws -> Availability
    /// Saves nothing.
    func plan(_ request: PlanRequest) async throws -> PlanningProposal
    /// Creates the chosen sessions, or none of them.
    func apply(_ approval: PlanApply) async throws -> PlanApplyResult
}

public struct RemoteCalendarRepository: CalendarRepository {
    private let client: APIClient

    public init(client: APIClient) {
        self.client = client
    }

    public func events(from start: Date, until end: Date) async throws -> CalendarEventsPage {
        let style = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
        let query = [URLQueryItem(name: "from", value: start.formatted(style)), URLQueryItem(name: "to", value: end.formatted(style))]
        return try await client.send(APIRequest<CalendarEventsPage>.get("/api/calendar/events", query: query)).value
    }

    public func create(_ event: CalendarEventCreate) async throws -> CalendarEvent {
        try await client.send(APIRequest<CalendarEventResponse>.post("/api/calendar/events", body: event)).value.event
    }

    public func update(_ id: CalendarEvent.ID, _ change: CalendarEventUpdate) async throws -> CalendarEvent {
        try await client.send(APIRequest<CalendarEventResponse>.patch("/api/calendar/events/\(id)", body: change)).value.event
    }

    public func delete(event id: CalendarEvent.ID) async throws {
        _ = try await client.send(APIRequest<NoContent>.delete("/api/calendar/events/\(id)"))
    }

    public func unscheduledTasks() async throws -> [UnscheduledTask] {
        try await client.send(APIRequest<UnscheduledTasksResponse>.get("/api/calendar/unscheduled-tasks")).value.tasks
    }

    public func availability() async throws -> Availability {
        try await client.send(APIRequest<Availability>.get("/api/calendar/availability")).value
    }

    public func saveAvailability(_ update: AvailabilityUpdate) async throws -> Availability {
        try await client.send(APIRequest<Availability>.put("/api/calendar/availability", body: update)).value
    }

    public func plan(_ request: PlanRequest) async throws -> PlanningProposal {
        try await client.send(APIRequest<PlanningProposalResponse>.post("/api/calendar/plan", body: request)).value.proposal
    }

    public func apply(_ approval: PlanApply) async throws -> PlanApplyResult {
        try await client.send(APIRequest<PlanApplyResponse>.post("/api/calendar/plan/apply", body: approval)).value.result
    }
}
