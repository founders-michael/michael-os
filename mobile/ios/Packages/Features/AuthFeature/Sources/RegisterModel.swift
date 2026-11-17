import Foundation
import Models
import Observation
import Repositories

@MainActor
@Observable
public final class RegisterModel {
    public enum State: Equatable {
        case idle
        case submitting
        case failed(AppError)
        /// The account was created, or the address was already registered: the server answers both the same
        /// way. Either way the next step is Check your email; the screen moves there and calls
        /// `confirmationShown()`.
        case registered(email: String)
    }

    public private(set) var state: State = .idle
    private let auth: any AuthRepository

    public init(auth: any AuthRepository) {
        self.auth = auth
    }

    public static func canSubmit(name: String, email: String, password: String) -> Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && email.trimmingCharacters(in: .whitespacesAndNewlines).contains("@")
            && PasswordRules(password).isMet
    }

    public func register(name: String, email: String, password: String) async {
        guard state != .submitting, Self.canSubmit(name: name, email: email, password: password) else { return }
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        state = .submitting
        do {
            try await auth.register(
                name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                email: email,
                password: password
            )
            state = .registered(email: email)
        } catch let error as AppError {
            state = .failed(error)
        } catch {
            state = .idle
        }
    }

    public func confirmationShown() {
        state = .idle
    }
}
