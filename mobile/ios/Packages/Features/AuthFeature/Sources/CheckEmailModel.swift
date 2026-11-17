import Foundation
import Models
import Observation
import Repositories

@MainActor
@Observable
public final class CheckEmailModel {
    public enum State: Equatable {
        /// A link was just sent, so Resend waits. Seconds left until it is offered.
        case coolingDown(seconds: Int)
        case ready
        case sending
        case failed(AppError)
    }

    /// The web app waits the same time between resends; the server also limits them.
    static let cooldownSeconds = 30

    public let email: String
    public private(set) var state: State = .coolingDown(seconds: cooldownSeconds)
    private let auth: any AuthRepository
    private let sleep: @Sendable (Duration) async throws -> Void

    public init(
        email: String,
        auth: any AuthRepository,
        sleep: @escaping @Sendable (Duration) async throws -> Void = { try await _Concurrency.Task.sleep(for: $0) }
    ) {
        self.email = email
        self.auth = auth
        self.sleep = sleep
    }

    public var isCoolingDown: Bool {
        if case .coolingDown = state { return true }
        return false
    }

    /// Runs while the screen is visible and while a cooldown is on; cancelled with the view.
    public func countDown() async {
        while case .coolingDown(let seconds) = state {
            if seconds <= 0 {
                state = .ready
                return
            }
            do {
                try await sleep(.seconds(1))
            } catch {
                return
            }
            if case .coolingDown(let remaining) = state {
                state = remaining > 1 ? .coolingDown(seconds: remaining - 1) : .ready
            }
        }
    }

    public func resend() async {
        switch state {
        case .ready, .failed: break
        case .coolingDown, .sending: return
        }
        state = .sending
        do {
            try await auth.resendVerification(email: email)
            state = .coolingDown(seconds: Self.cooldownSeconds)
        } catch let error as AppError {
            state = .failed(error)
        } catch {
            state = .ready
        }
    }
}
