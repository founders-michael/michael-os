import Foundation
import Models
import Networking

public protocol MyDayRepository: Sendable {
    /// Nil asks for the server's today in the profile's time zone. Throws `AppError` or `CancellationError`.
    func day(_ date: LocalDate?) async throws -> MyDay
}

public struct RemoteMyDayRepository: MyDayRepository {
    private let client: APIClient

    public init(client: APIClient) {
        self.client = client
    }

    public func day(_ date: LocalDate?) async throws -> MyDay {
        let query = date.map { [URLQueryItem(name: "date", value: $0.description)] } ?? []
        return try await client.send(APIRequest<MyDay>.get("/api/my-day", query: query)).value
    }
}
