import Foundation
import Models
import Networking

/// Every call throws `AppError` or `CancellationError`.
public protocol ReviewRepository: Sendable {
    /// Nil date reads today in the profile's zone.
    func review(_ date: LocalDate?) async throws -> DailyReview
    func save(_ reflection: ReflectionSave) async throws
    /// The date the task now has, nil when left unscheduled.
    func carryForward(_ move: CarryForward) async throws -> LocalDate?
}

public struct RemoteReviewRepository: ReviewRepository {
    private let client: APIClient

    public init(client: APIClient) {
        self.client = client
    }

    public func review(_ date: LocalDate?) async throws -> DailyReview {
        let query = date.map { [URLQueryItem(name: "date", value: $0.description)] } ?? []
        return try await client.send(APIRequest<DailyReview>.get("/api/lifestyle/daily-review", query: query)).value
    }

    public func save(_ reflection: ReflectionSave) async throws {
        _ = try await client.send(APIRequest<ReflectionResponse>.put("/api/lifestyle/daily-review", body: reflection))
    }

    public func carryForward(_ move: CarryForward) async throws -> LocalDate? {
        try await client.send(APIRequest<CarryForwardResponse>.post("/api/lifestyle/daily-review/carry-forward", body: move)).value.result
            .targetDate
    }
}
