import Models
import Networking

/// Every call throws `AppError` or `CancellationError`.
public protocol ProfileRepository: Sendable {
    /// Nil until onboarding saves its first step.
    func profile() async throws -> Profile?
    func save(_ update: ProfileUpdate) async throws -> Profile
    /// Needs a saved `onboardingStep` of 5; the server refuses earlier calls with 400.
    func complete() async throws -> Profile
    /// Settings' routine; refused with `validation` and per-field messages.
    func saveRoutine(_ routine: RoutineUpdate) async throws -> Profile
}

public struct RemoteProfileRepository: ProfileRepository {
    private let client: APIClient

    public init(client: APIClient) {
        self.client = client
    }

    public func profile() async throws -> Profile? {
        try await client.send(APIRequest<ProfileResponse>.get("/api/profile")).value.profile
    }

    public func save(_ update: ProfileUpdate) async throws -> Profile {
        try required(try await client.send(APIRequest<ProfileResponse>.patch("/api/profile", body: update)).value.profile)
    }

    public func complete() async throws -> Profile {
        try required(try await client.send(APIRequest<ProfileResponse>.post("/api/profile/complete", body: EmptyBody())).value.profile)
    }

    public func saveRoutine(_ routine: RoutineUpdate) async throws -> Profile {
        try required(try await client.send(APIRequest<ProfileResponse>.patch("/api/profile/routine", body: routine)).value.profile)
    }

    private func required(_ profile: Profile?) throws -> Profile {
        guard let profile else { throw AppError.decoding }
        return profile
    }
}
