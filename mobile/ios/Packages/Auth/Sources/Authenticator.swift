import Models
import Networking
import os

/// Email sign-in and sign-out against Better Auth.
public struct Authenticator: Sendable {
    private let client: APIClient
    private let session: Session

    public init(client: APIClient, session: Session) {
        self.client = client
        self.session = session
    }

    /// Throws `AppError` (wrong password is `unauthorized`, an unverified email is `forbidden` with code
    /// `EMAIL_NOT_VERIFIED`) or `CancellationError`.
    public func signIn(email: String, password: String) async throws -> AuthUser {
        let request = try APIRequest<SignInResponse>.post(
            "/api/auth/sign-in/email",
            body: SignInRequest(email: email, password: password)
        )
        let response = try await client.send(request)
        guard let token = response.header("set-auth-token"), !token.isEmpty else { throw AppError.decoding }
        await session.begin(token)
        return response.value.user
    }

    /// Signs out on this device even when the server cannot be reached; the server session then lasts until
    /// it expires.
    public func signOut() async {
        do {
            _ = try await client.send(try APIRequest<SignOutResponse>.post("/api/auth/sign-out", body: EmptyBody()))
        } catch {
            Logger(subsystem: "com.michaelos.app", category: "session")
                .error("Server sign-out failed: \(String(describing: error), privacy: .public)")
        }
        await session.end()
    }
}
