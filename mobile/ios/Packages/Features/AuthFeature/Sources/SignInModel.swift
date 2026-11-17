import Foundation
import Models
import Observation
import Repositories

@MainActor
@Observable
public final class SignInModel {
    public enum State: Equatable {
        case idle
        case submitting
        case failed(AppError)
        /// The account exists but its email is not verified. The server has sent a fresh link; the screen moves
        /// to Check your email and then calls `verificationShown()`.
        case needsVerification(email: String)
    }

    public private(set) var state: State = .idle
    private let auth: any AuthRepository

    public init(auth: any AuthRepository) {
        self.auth = auth
    }

    public static func canSubmit(email: String, password: String) -> Bool {
        email.trimmingCharacters(in: .whitespacesAndNewlines).contains("@") && !password.isEmpty
    }

    /// A successful sign-in changes the session, and the app moves on from there; this screen only reports
    /// failures. A second tap while one is in flight is ignored.
    public func signIn(email: String, password: String) async {
        guard state != .submitting else { return }
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        state = .submitting
        do {
            try await auth.signIn(email: email, password: password)
            state = .idle
        } catch let error as AppError {
            if case .forbidden(let server) = error, server.code == "EMAIL_NOT_VERIFIED" {
                state = .needsVerification(email: email)
            } else {
                state = .failed(error)
            }
        } catch {
            state = .idle
        }
    }

    public func verificationShown() {
        state = .idle
    }
}
