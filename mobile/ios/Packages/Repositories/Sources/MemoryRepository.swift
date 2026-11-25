import Models
import Networking

/// Every call throws `AppError` or `CancellationError`.
public protocol MemoryRepository: Sendable {
    func create(_ memory: MemoryCreate) async throws -> Memory
}

public struct RemoteMemoryRepository: MemoryRepository {
    private let client: APIClient

    public init(client: APIClient) {
        self.client = client
    }

    public func create(_ memory: MemoryCreate) async throws -> Memory {
        try await client.send(APIRequest<MemoryResponse>.post("/api/memories", body: memory)).value.memory
    }
}
