import Auth
import Models

/// What the sign-in and register screens need. Every call throws `AppError` or `CancellationError`.
public protocol AuthRepository: Sendable {
    func signIn(email: String, password: String) async throws
    func register(name: String, email: String, password: String) async throws
    func resendVerification(email: String) async throws
    func signOut() async
}

public struct RemoteAuthRepository: AuthRepository {
    private let authenticator: Authenticator

    public init(authenticator: Authenticator) {
        self.authenticator = authenticator
    }

    public func signIn(email: String, password: String) async throws {
        _ = try await authenticator.signIn(email: email, password: password)
    }

    public func register(name: String, email: String, password: String) async throws {
        try await authenticator.register(name: name, email: email, password: password)
    }

    public func resendVerification(email: String) async throws {
        try await authenticator.resendVerification(email: email)
    }

    public func signOut() async {
        await authenticator.signOut()
    }
}
