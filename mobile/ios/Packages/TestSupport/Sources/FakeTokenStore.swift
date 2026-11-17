import Auth
import os

public final class FakeTokenStore: TokenStore {
    private let state: OSAllocatedUnfairLock<(token: String?, deletes: Int)>

    public init(token: String? = nil) {
        state = OSAllocatedUnfairLock(initialState: (token, 0))
    }

    public var deletes: Int { state.withLock { $0.deletes } }

    public func read() throws -> String? { state.withLock { $0.token } }

    public func save(_ token: String) throws { state.withLock { $0.token = token } }

    public func delete() throws {
        state.withLock {
            $0.token = nil
            $0.deletes += 1
        }
    }
}
