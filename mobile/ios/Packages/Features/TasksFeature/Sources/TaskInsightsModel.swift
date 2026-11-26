import Foundation
import Models
import Observation
import Repositories

/// The goals a task supports and its categories, on the task's detail screen. None of these writes is optimistic: the
/// server may refuse a link, and a suggestion is computed there, so each waits for the answer (root `CLAUDE.md` 9.5).
@MainActor
@Observable
final class TaskInsightsModel {
    static let goalLimit = 5

    enum Busy: Equatable {
        case goals, suggest, add
        case classification(Classification.ID)
    }

    private(set) var linked: [GoalLink]?
    private(set) var activeGoals: [Goal] = []
    private(set) var classifications: [Classification]?
    private(set) var catalog: [TaxonomyCategory] = []
    private(set) var busy: Busy?
    private(set) var problem: AppError?
    /// Michael found no category that clearly fits.
    private(set) var noSuggestion = false
    /// The server asked for the data-use acknowledgement before suggesting.
    private(set) var needsAcknowledgement = false

    let taskID: Task.ID
    private let intelligence: any TaskIntelligenceRepository

    init(taskID: Task.ID, intelligence: any TaskIntelligenceRepository) {
        self.taskID = taskID
        self.intelligence = intelligence
    }

    /// Goals to offer: the active ones, then any linked goal no longer active, so it can still be unlinked.
    var goalChoices: [GoalLink] {
        let active = activeGoals.map { GoalLink(id: $0.id, title: $0.title, status: $0.status, targetDate: $0.targetDate) }
        let activeIDs = Set(active.map(\.id))
        return active + (linked ?? []).filter { !activeIDs.contains($0.id) }
    }

    var confirmed: [Classification] { (classifications ?? []).filter { !$0.inferred } }

    /// A suggestion the user already confirmed shows once, as theirs.
    var suggestions: [Classification] {
        let keys = Set(confirmed.map(\.category.key))
        return (classifications ?? []).filter { $0.inferred && !keys.contains($0.category.key) }
    }

    var addable: [TaxonomyCategory] {
        let keys = Set(confirmed.map(\.category.key))
        return catalog.filter { !keys.contains($0.key) }
    }

    func isLinked(_ goal: GoalLink) -> Bool { linked?.contains { $0.id == goal.id } ?? false }

    func canLink(_ goal: GoalLink) -> Bool { isLinked(goal) || (linked?.count ?? 0) < Self.goalLimit }

    func load() async {
        async let links = try? intelligence.goalLinks(taskID)
        async let goals = try? intelligence.activeGoals()
        async let rows = intelligence.classifications(taskID)
        async let categories = try? intelligence.categories()
        do {
            let (links, goals, rows, categories) = try await (links, goals, rows, categories)
            linked = links ?? []
            activeGoals = goals ?? []
            classifications = rows
            catalog = categories ?? []
        } catch is CancellationError {
            return
        } catch {
            problem = AppError(error)
            classifications = classifications ?? []
            linked = linked ?? []
        }
    }

    func toggle(_ goal: GoalLink) async {
        guard busy == nil, let linked, canLink(goal) else { return }
        let next = isLinked(goal) ? linked.filter { $0.id != goal.id }.map(\.id) : linked.map(\.id) + [goal.id]
        await perform(.goals) { self.linked = try await self.intelligence.setGoalLinks(self.taskID, next) }
    }

    func classify(_ category: TaxonomyCategory) async {
        await perform(.add) {
            let added = try await self.intelligence.classify(self.taskID, as: category.key)
            self.classifications = (self.classifications ?? []) + [added]
        }
    }

    func remove(_ classification: Classification) async {
        await perform(.classification(classification.id)) {
            try await self.intelligence.removeClassification(classification.id)
            self.classifications = self.classifications?.filter { $0.id != classification.id }
        }
    }

    func confirm(_ suggestion: Classification) async {
        await perform(.classification(suggestion.id)) {
            let confirmed = try await self.intelligence.confirm(suggestion.id)
            self.classifications = (self.classifications ?? []) + [confirmed]
        }
    }

    func suggest(acknowledged: Bool = false) async {
        noSuggestion = false
        await perform(.suggest) {
            do {
                let suggestion = try await self.intelligence.suggest(self.taskID, dataUseAcknowledged: acknowledged)
                self.needsAcknowledgement = false
                if let suggestion {
                    self.classifications = (self.classifications ?? []) + [suggestion]
                } else {
                    self.noSuggestion = true
                }
            } catch AppError.validation(let server, _) where server.code == "DATA_USE_ACKNOWLEDGEMENT_REQUIRED" {
                self.needsAcknowledgement = true
            }
        }
    }

    func declineAcknowledgement() {
        needsAcknowledgement = false
    }

    private func perform(_ action: Busy, _ work: () async throws -> Void) async {
        guard busy == nil else { return }
        busy = action
        problem = nil
        defer { busy = nil }
        do {
            try await work()
        } catch is CancellationError {
            return
        } catch {
            problem = AppError(error)
        }
    }
}
