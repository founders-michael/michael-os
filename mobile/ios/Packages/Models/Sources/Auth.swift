import Foundation

public struct AuthUser: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let email: String
    public let emailVerified: Bool
    public let image: String?
}

public struct SignInRequest: Encodable, Sendable {
    public let email: String
    public let password: String

    public init(email: String, password: String) {
        self.email = email
        self.password = password
    }
}

/// The session token is not read from this body: the body carries the unsigned token, which the server
/// refuses. The signed one arrives in the `set-auth-token` header.
public struct SignInResponse: Decodable, Equatable, Sendable {
    public let user: AuthUser
}

/// `GET /api/auth/get-session`. The server answers 200 with `null` when there is no session, so callers
/// decode `AuthSession?`.
public struct AuthSession: Decodable, Equatable, Sendable {
    public struct Details: Decodable, Equatable, Sendable {
        public let id: String
        public let userId: String
        public let expiresAt: Date
    }

    public let session: Details
    public let user: AuthUser
}

public struct SignOutResponse: Decodable, Equatable, Sendable {
    public let success: Bool
}
