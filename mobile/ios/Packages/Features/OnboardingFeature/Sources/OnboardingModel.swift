import Foundation
import Models
import Observation
import Repositories

@MainActor
@Observable
public final class OnboardingModel {
    public enum Stage: Equatable {
        case loading
        /// The saved profile could not be read; nothing is shown until it can be.
        case failed(AppError)
        case step(OnboardingStep)
        /// Saved and completed. The app moves on and calls nothing back.
        case finished
    }

    public struct State: Equatable {
        public var stage: Stage
        public var draft: OnboardingDraft
        public var isSaving: Bool
        /// A save that failed for a reason other than the answers themselves.
        public var problem: AppError?
        /// Messages for fields, keyed by the server's field names.
        public var fieldErrors: [String: String]
    }

    public private(set) var state: State
    private let profiles: any ProfileRepository

    public init(profiles: any ProfileRepository, suggestedName: String, deviceTimeZone: String) {
        self.profiles = profiles
        state = State(
            stage: .loading,
            draft: .initial(name: suggestedName, timeZone: deviceTimeZone),
            isSaving: false,
            problem: nil,
            fieldErrors: [:]
        )
    }

    /// Resumes at the step the server has saved, with the answers it holds.
    public func load() async {
        state.stage = .loading
        do {
            let profile = try await profiles.profile()
            if let profile {
                state.draft = OnboardingDraft(profile)
            }
            state.stage = profile?.onboardingCompleted == true ? .finished : .step(OnboardingStep(resumingAt: profile?.onboardingStep ?? 0))
        } catch let error as AppError {
            state.stage = .failed(error)
        } catch {
            return
        }
    }

    public func edit(_ change: (inout OnboardingDraft) -> Void) {
        change(&state.draft)
        state.fieldErrors = [:]
        state.problem = nil
    }

    public func back() {
        guard case .step(let step) = state.stage, let previous = step.previous else { return }
        state.fieldErrors = [:]
        state.problem = nil
        state.stage = .step(previous)
    }

    /// Validates and saves the current step, then moves on. The last step also completes onboarding.
    public func advance() async {
        guard case .step(let step) = state.stage, !state.isSaving else { return }
        if step == .work {
            state.draft.workStartTime = state.draft.workStartTime ?? OnboardingDraft.defaultWorkStart
            state.draft.workEndTime = state.draft.workEndTime ?? OnboardingDraft.defaultWorkEnd
        }
        let errors = Self.validate(step, state.draft)
        guard errors.isEmpty else {
            state.fieldErrors = errors
            return
        }
        await save(step)
    }

    /// "I don't have fixed hours": no work days and no hours.
    public func skipWorkHours() async {
        guard state.stage == .step(.work) else { return }
        state.draft.workDays = []
        state.draft.workStartTime = nil
        state.draft.workEndTime = nil
        await save(.work)
    }

    public func skipPriorities() async {
        guard state.stage == .step(.priorities) else { return }
        state.draft.priorities = []
        await save(.priorities)
    }

    /// Adds a priority typed by the user. Returns false, with a message, when it cannot be added.
    @discardableResult
    public func addPriority(_ text: String) -> Bool {
        let priority = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let message: String? =
            if priority.isEmpty {
                nil
            } else if state.draft.priorities.count >= OnboardingDraft.priorityLimit {
                String(localized: "onboarding.priorities.full", bundle: .module)
            } else if priority.count > OnboardingDraft.priorityLength {
                String(localized: "onboarding.priorities.tooLong \(OnboardingDraft.priorityLength)", bundle: .module)
            } else if state.draft.priorities.contains(where: { $0.caseInsensitiveCompare(priority) == .orderedSame }) {
                String(localized: "onboarding.priorities.duplicate", bundle: .module)
            } else {
                nil
            }
        if let message {
            state.fieldErrors = ["priorities": message]
            return false
        }
        guard !priority.isEmpty else { return false }
        edit { $0.priorities.append(priority) }
        return true
    }

    public func removePriority(_ priority: String) {
        edit { $0.priorities.removeAll { $0 == priority } }
    }

    private func save(_ step: OnboardingStep) async {
        state.isSaving = true
        state.problem = nil
        defer { state.isSaving = false }
        do {
            _ = try await profiles.save(state.draft.update(onboardingStep: step.serverStepAfter))
            if let next = step.next {
                state.stage = .step(next)
            } else {
                _ = try await profiles.complete()
                state.stage = .finished
            }
        } catch let error as AppError {
            if case .validation(_, let fields) = error, !fields.isEmpty {
                state.fieldErrors = fields.compactMapValues(\.first)
                if let first = OnboardingStep.allCases.first(where: { candidate in
                    fields.keys.contains { OnboardingStep.showing(field: $0) == candidate }
                }) {
                    state.stage = .step(first)
                }
            } else {
                state.problem = error
            }
        } catch {
            return
        }
    }

    static func validate(_ step: OnboardingStep, _ draft: OnboardingDraft) -> [String: String] {
        switch step {
        case .name:
            let name = draft.preferredName.trimmingCharacters(in: .whitespacesAndNewlines)
            if name.isEmpty {
                return ["preferredName": String(localized: "onboarding.name.required", bundle: .module)]
            }
            if name.count > OnboardingDraft.nameLimit {
                return ["preferredName": String(localized: "onboarding.name.tooLong \(OnboardingDraft.nameLimit)", bundle: .module)]
            }
            return [:]
        case .work:
            if let start = draft.workStartTime, let end = draft.workEndTime, end <= start {
                return ["workEndTime": String(localized: "onboarding.work.endAfterStart", bundle: .module)]
            }
            return [:]
        case .sleep, .priorities, .focus:
            return [:]
        }
    }
}
