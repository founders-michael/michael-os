import Models
import Repositories
import os

/// Records calls and answers with whatever the test set. Each `next…` result is used once, then calls succeed.
public final class FakeAuthRepository: AuthRepository {
    public enum Call: Equatable, Sendable {
        case signIn(email: String, password: String)
        case register(name: String, email: String, password: String)
        case resendVerification(email: String)
        case signOut
    }

    private struct State {
        var calls: [Call] = []
        var failure: AppError?
        var gate: (@Sendable () async -> Void)?
    }

    private let lock = OSAllocatedUnfairLock(initialState: State())

    public init() {}

    public var calls: [Call] { lock.withLock { $0.calls } }

    /// The next call throws this error.
    public func fail(with error: AppError) { lock.withLock { $0.failure = error } }

    /// The next call waits for this before answering, so a test can tap twice while one is in flight.
    public func hold(until gate: @escaping @Sendable () async -> Void) { lock.withLock { $0.gate = gate } }

    private func record(_ call: Call) async throws {
        let (failure, gate) = lock.withLock { state -> (AppError?, (@Sendable () async -> Void)?) in
            state.calls.append(call)
            defer {
                state.failure = nil
                state.gate = nil
            }
            return (state.failure, state.gate)
        }
        if let gate { await gate() }
        if let failure { throw failure }
    }

    public func signIn(email: String, password: String) async throws {
        try await record(.signIn(email: email, password: password))
    }

    public func register(name: String, email: String, password: String) async throws {
        try await record(.register(name: name, email: email, password: password))
    }

    public func resendVerification(email: String) async throws {
        try await record(.resendVerification(email: email))
    }

    public func signOut() async {
        try? await record(.signOut)
    }
}

public final class FakeProfileRepository: ProfileRepository {
    private struct State {
        var profile: Profile?
        var saved: [ProfileUpdate] = []
        var completes = 0
        var failures: [AppError] = []
    }

    private let lock: OSAllocatedUnfairLock<State>

    public init(profile: Profile? = nil) {
        lock = OSAllocatedUnfairLock(initialState: State(profile: profile))
    }

    public var saved: [ProfileUpdate] { lock.withLock { $0.saved } }
    public var completes: Int { lock.withLock { $0.completes } }

    /// The next calls fail with these, in order.
    public func fail(with errors: AppError...) { lock.withLock { $0.failures = errors } }

    private func nextFailure() -> AppError? {
        lock.withLock { $0.failures.isEmpty ? nil : $0.failures.removeFirst() }
    }

    public func profile() async throws -> Profile? {
        if let failure = nextFailure() { throw failure }
        return lock.withLock { $0.profile }
    }

    public func save(_ update: ProfileUpdate) async throws -> Profile {
        if let failure = nextFailure() { throw failure }
        return lock.withLock { state in
            state.saved.append(update)
            let profile = Profile(update, completed: false)
            state.profile = profile
            return profile
        }
    }

    public func complete() async throws -> Profile {
        if let failure = nextFailure() { throw failure }
        return try lock.withLock { state in
            guard let current = state.profile, current.onboardingStep >= 5 else {
                throw AppError.validation(ServerMessage(text: "Save your onboarding details before finishing."), fields: [:])
            }
            state.completes += 1
            let profile = current.completed()
            state.profile = profile
            return profile
        }
    }

    public func saveRoutine(_ routine: RoutineUpdate) async throws -> Profile {
        if let failure = nextFailure() { throw failure }
        return try lock.withLock { state in
            guard let current = state.profile else { throw AppError.conflict(ServerMessage()) }
            let update = ProfileUpdate(
                preferredName: current.preferredName, timeZone: routine.timeZone, wakeUpTime: routine.wakeUpTime,
                bedtime: routine.bedtime, workStartTime: routine.workStartTime, workEndTime: routine.workEndTime,
                workDays: routine.workDays, priorities: routine.priorities, focusSessionMinutes: routine.focusSessionMinutes,
                breakDurationMinutes: routine.breakDurationMinutes, planningStyle: routine.planningStyle,
                onboardingStep: current.onboardingStep
            )
            let profile = Profile(update, completed: current.onboardingCompleted)
            state.profile = profile
            return profile
        }
    }
}
