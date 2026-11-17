import Networking
import Observation
import os

/// Whether the user is signed in, and the token that proves it. The root view observes `state` and shows
/// sign-in when it becomes `signedOut`.
@MainActor
@Observable
public final class Session: SessionCredentials {
    public enum State: Equatable, Sendable {
        case signedOut
        case signedIn
    }

    public private(set) var state: State
    @ObservationIgnored private var token: String?
    @ObservationIgnored private let store: any TokenStore
    @ObservationIgnored private let log = Logger(subsystem: "com.michaelos.app", category: "session")

    public init(store: any TokenStore) {
        self.store = store
        var stored: String?
        do {
            stored = try store.read()
        } catch {
            log.error("Reading the session token failed: \(String(describing: error), privacy: .public)")
        }
        token = stored
        state = stored == nil ? .signedOut : .signedIn
    }

    public func currentToken() -> String? {
        token
    }

    public func begin(_ token: String) {
        self.token = token
        state = .signedIn
        do {
            try store.save(token)
        } catch {
            log.error("Saving the session token failed; signed in until the app closes: \(String(describing: error), privacy: .public)")
        }
    }

    public func end() {
        guard token != nil else { return }
        token = nil
        state = .signedOut
        do {
            try store.delete()
        } catch {
            log.error("Deleting the session token failed: \(String(describing: error), privacy: .public)")
        }
    }

    /// Every request that fails with 401 lands here. Only a rejection of the token currently held signs out,
    /// so several requests failing together sign out once, and a late 401 for a token replaced by a new
    /// sign-in is ignored.
    public func reject(_ rejected: String) {
        guard token == rejected else { return }
        end()
    }
}
