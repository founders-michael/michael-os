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

    /// Creates the account and sends the verification email. It starts no session: the address must be verified
    /// and the user signs in afterwards. An address that is already registered gets the same answer.
    public func register(name: String, email: String, password: String) async throws {
        let request = try APIRequest<SignUpResponse>.post(
            "/api/auth/sign-up/email",
            body: SignUpRequest(name: name, email: email, password: password)
        )
        _ = try await client.send(request)
    }

    public func resendVerification(email: String) async throws {
        _ = try await client.send(
            try APIRequest<StatusResponse>.post("/api/auth/send-verification-email", body: VerificationEmailRequest(email: email))
        )
    }

    /// Asks the server whether the stored token is still a session. When it is not, the session ends here and
    /// nil is returned. A failure to ask (offline, timeout, server) throws and leaves the session alone, so an
    /// offline launch does not sign the user out.
    public func validateSession() async throws -> AuthUser? {
        guard let current = try await client.send(APIRequest<AuthSession?>.get("/api/auth/get-session")).value else {
            await session.end()
            return nil
        }
        return current.user
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
