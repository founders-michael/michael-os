import Foundation
import Models
import Networking

/// Every call throws `AppError` or `CancellationError`.
public protocol AccountRepository: Sendable {
    func account() async throws -> Account
    func save(_ update: AccountUpdate) async throws -> Account
    func context() async throws -> PersonalContext
    /// Refused with `conflict` (`CONTEXT_CHANGED`) when the context was saved elsewhere since `expectedUpdatedAt`.
    func save(_ context: PersonalContextSave) async throws -> PersonalContext
    /// Back to the sign-in provider's picture, or initials.
    func removePicture() async throws -> Account
    /// Removes the account and everything in it. The session on this device is cleared by signing out after.
    func deleteAccount(password: String) async throws
}

public struct RemoteAccountRepository: AccountRepository {
    private let client: APIClient

    public init(client: APIClient) {
        self.client = client
    }

    public func account() async throws -> Account {
        try await client.send(APIRequest<AccountResponse>.get("/api/account")).value.account
    }

    public func save(_ update: AccountUpdate) async throws -> Account {
        try await client.send(APIRequest<AccountResponse>.patch("/api/account", body: update)).value.account
    }

    public func context() async throws -> PersonalContext {
        try await client.send(APIRequest<PersonalContextResponse>.get("/api/account/context")).value.context
    }

    public func save(_ context: PersonalContextSave) async throws -> PersonalContext {
        try await client.send(APIRequest<PersonalContextResponse>.put("/api/account/context", body: context)).value.context
    }

    public func removePicture() async throws -> Account {
        try await client.send(APIRequest<AccountResponse>.delete("/api/account/image")).value.account
    }

    public func deleteAccount(password: String) async throws {
        _ = try await client.send(APIRequest<SuccessResponse>.post("/api/auth/delete-user", body: DeleteAccountRequest(password: password)))
    }
}
