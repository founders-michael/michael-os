import Foundation

/// `GET /api/account`: the signed-in user's own details. Email is not editable.
public struct Account: Decodable, Equatable, Sendable {
    public let fullName: String
    public let email: String
    public let preferredName: String
    /// Sign-in methods; `credential` is email and password.
    public let providers: [String]
    public let hasCustomImage: Bool
    public let identity: AccountIdentity
}

/// How every screen shows the user.
public struct AccountIdentity: Decodable, Equatable, Sendable {
    public let displayName: String
    public let initials: String
    /// A custom picture's URL is the session-only `/api/account/image` with a version; a provider's is public.
    public let avatarUrl: String?
    public let avatarSource: AvatarSource
}

public enum AvatarSource: String, OpenEnum {
    case custom
    case provider
    case none
    case unknown
}

public struct AccountResponse: Decodable, Equatable, Sendable {
    public let account: Account
}

/// `PATCH /api/account`.
public struct AccountUpdate: Encodable, Equatable, Sendable {
    public let fullName: String
    public let preferredName: String

    public init(fullName: String, preferredName: String) {
        self.fullName = fullName
        self.preferredName = preferredName
    }
}

/// My Context: the text Michael reads about the user, and the version it was saved at (nil before the first save).
public struct PersonalContext: Decodable, Equatable, Sendable {
    public let summary: String
    /// Kept as the server wrote it: the server compares it to the millisecond, so it is never re-encoded.
    public let updatedAt: String?

    public init(summary: String, updatedAt: String?) {
        self.summary = summary
        self.updatedAt = updatedAt
    }
}

public struct PersonalContextResponse: Decodable, Equatable, Sendable {
    public let context: PersonalContext
}

/// `PUT /api/account/context`. The server refuses it with 409 when the saved version is newer than `expectedUpdatedAt`.
public struct PersonalContextSave: Encodable, Equatable, Sendable {
    public let summary: String
    public let expectedUpdatedAt: String?

    public init(summary: String, expectedUpdatedAt: String?) {
        self.summary = summary
        self.expectedUpdatedAt = expectedUpdatedAt
    }

    private enum CodingKeys: String, CodingKey { case summary, expectedUpdatedAt }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(summary, forKey: .summary)
        try container.encode(expectedUpdatedAt, forKey: .expectedUpdatedAt)
    }
}

/// `POST /api/auth/delete-user`.
public struct DeleteAccountRequest: Encodable, Equatable, Sendable {
    public let password: String

    public init(password: String) {
        self.password = password
    }
}
