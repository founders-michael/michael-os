import Foundation
import Models
import Networking

public protocol TaskRepository: Sendable {
    /// Throws `AppError` or `CancellationError`.
    func list(page: Int) async throws -> TaskPage
}

public struct RemoteTaskRepository: TaskRepository {
    private let client: APIClient

    public init(client: APIClient) {
        self.client = client
    }

    public func list(page: Int) async throws -> TaskPage {
        try await client.send(.get("/api/tasks", query: [URLQueryItem(name: "page", value: String(page))])).value
    }
}
