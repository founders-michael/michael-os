import Foundation
import Models
import Repositories
import os

/// Answers from the saved examples, then from what the test changed. A queued failure answers the next call.
public final class FakeTaskIntelligenceRepository: TaskIntelligenceRepository {
    public enum Call: Equatable, Sendable {
        case priorities(Int), goalLinks, setGoalLinks([String]), activeGoals, categories, classifications
        case classify(String), remove(Classification.ID), suggest(Bool), confirm(Classification.ID)
    }

    private struct State {
        var calls: [Call] = []
        var failures: [AppError] = []
        var linked: [GoalLink] = []
        var goals: [Goal] = []
        var rows: [Classification] = []
        var suggestion: Classification?
        var created = 0
    }

    private let lock = OSAllocatedUnfairLock(initialState: State())

    public init(goals: [Goal] = [], suggestion: Classification? = nil) {
        lock.withLock {
            $0.goals = goals
            $0.suggestion = suggestion
        }
    }

    public var calls: [Call] { lock.withLock { $0.calls } }

    public func fail(with errors: AppError...) { lock.withLock { $0.failures = errors } }

    public func priorities(page: Int) async throws -> PrioritiesPage {
        try record(.priorities(page))
        return try JSONDecoder.api().decode(PrioritiesPage.self, from: try ContractExamples.example("tasks-priorities.json"))
    }

    public func goalLinks(_ task: Task.ID) async throws -> [GoalLink] {
        try record(.goalLinks)
        return lock.withLock { $0.linked }
    }

    public func setGoalLinks(_ task: Task.ID, _ goals: [String]) async throws -> [GoalLink] {
        try record(.setGoalLinks(goals))
        return lock.withLock { state in
            state.linked = state.goals.filter { goals.contains($0.id) }
                .map { GoalLink(id: $0.id, title: $0.title, status: $0.status, targetDate: $0.targetDate) }
            return state.linked
        }
    }

    public func activeGoals() async throws -> [Goal] {
        try record(.activeGoals)
        return lock.withLock { $0.goals }
    }

    public func categories() async throws -> [TaxonomyCategory] {
        try record(.categories)
        return try JSONDecoder.api().decode(TaxonomyResponse.self, from: try ContractExamples.example("taxonomy-lifestyle.json")).categories
            .filter { $0.entityTypes.contains("TASK") }
    }

    public func classifications(_ task: Task.ID) async throws -> [Classification] {
        try record(.classifications)
        return lock.withLock { $0.rows }
    }

    public func classify(_ task: Task.ID, as categoryKey: String) async throws -> Classification {
        try record(.classify(categoryKey))
        return lock.withLock { state in
            state.created += 1
            let row = Classification(
                id: "c\(state.created)", category: Classification.Category(key: categoryKey, name: categoryKey, active: true),
                inferred: false,
                confidence: nil)
            state.rows.append(row)
            return row
        }
    }

    public func removeClassification(_ id: Classification.ID) async throws {
        try record(.remove(id))
        lock.withLock { $0.rows.removeAll { $0.id == id } }
    }

    public func suggest(_ task: Task.ID, dataUseAcknowledged: Bool) async throws -> Classification? {
        try record(.suggest(dataUseAcknowledged))
        return lock.withLock { state in
            if let suggestion = state.suggestion { state.rows.append(suggestion) }
            return state.suggestion
        }
    }

    public func confirm(_ id: Classification.ID) async throws -> Classification {
        try record(.confirm(id))
        return lock.withLock { state in
            let suggested = state.rows.first { $0.id == id }
            let row = Classification(
                id: "\(id)-confirmed", category: suggested?.category ?? Classification.Category(key: id, name: id, active: true),
                inferred: false, confidence: nil)
            state.rows.append(row)
            return row
        }
    }

    private func record(_ call: Call) throws {
        try lock.withLock { state in
            state.calls.append(call)
            if !state.failures.isEmpty { throw state.failures.removeFirst() }
        }
    }
}
