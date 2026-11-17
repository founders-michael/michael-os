import Foundation

public struct AuthUser: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let name: String
    public let email: String
    public let emailVerified: Bool
    public let image: String?
}

/// Where the emailed verification link sends the browser once it has verified the address: the web app's
/// LifestyleOS sign-in page, as on web. The user then returns to the app and signs in.
public let verificationCallbackPath = "/lifestyle/login"

public struct SignInRequest: Encodable, Sendable {
    public let email: String
    public let password: String
    public let callbackURL = verificationCallbackPath

    public init(email: String, password: String) {
        self.email = email
        self.password = password
    }
}

public struct SignUpRequest: Encodable, Sendable {
    public let name: String
    public let email: String
    public let password: String
    public let callbackURL = verificationCallbackPath

    public init(name: String, email: String, password: String) {
        self.name = name
        self.email = email
        self.password = password
    }
}

/// Sign-up answers the same way for a new address and one already registered, so the response says nothing
/// about which it was.
public struct SignUpResponse: Decodable, Equatable, Sendable {
    public let user: AuthUser
}

public struct VerificationEmailRequest: Encodable, Sendable {
    public let email: String
    public let callbackURL = verificationCallbackPath

    public init(email: String) {
        self.email = email
    }
}

public struct StatusResponse: Decodable, Equatable, Sendable {
    public let status: Bool
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
