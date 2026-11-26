import Foundation
import Models
import TestSupport
import Testing

@testable import TasksFeature

@MainActor
struct TaskIntelligenceTests {
    private func ranked() throws -> [RankedTask] {
        try JSONDecoder.api().decode(PrioritiesPage.self, from: try ContractExamples.example("tasks-priorities.json")).tasks
    }

    private func goal(_ id: String) throws -> Goal {
        let goal = try #require(
            try JSONDecoder.api().decode(GoalList.self, from: try ContractExamples.example("goals-active.json")).goals.first)
        return Goal(
            id: id, title: "Goal \(id)", description: nil, category: nil, status: .active, progress: 0, targetDate: goal.targetDate,
            completedAt: nil, milestoneCount: 0, completedMilestoneCount: 0, createdAt: goal.createdAt, updatedAt: goal.updatedAt)
    }

    @Test func theWhyNamesTheTwoReasonsThatLiftedTheTaskMost() throws {
        let first = try #require(try ranked().first)
        #expect(PriorityFormat.why(first) == "Overdue by 5 days · High priority")
        let rows = PriorityFormat.breakdown(first)
        #expect(rows.map(\.label).first == "Your priority")
        #expect(rows.first { $0.label == "Holds up other work" }?.points == nil)
    }

    @Test func aBlockedTaskLeadsWithWhatItWaitsOn() throws {
        let item = try #require(try ranked().first)
        let blocked = RankedTask(
            rank: 9, score: 10, actionable: false, blockedReason: PriorityReason(code: "WAITING_ON_BLOCKERS", numbers: ["count": 2]),
            components: item.components, task: item.task)
        #expect(PriorityFormat.why(blocked).hasPrefix("Waiting on 2 unfinished tasks"))
    }

    @Test func michaelsOrderReadsThePrioritiesAndKeepsEachRanking() async {
        let tasks = FakeTaskRepository(today: TaskFixtures.today)
        let intelligence = FakeTaskIntelligenceRepository()
        let model = TasksModel(tasks: tasks, intelligence: intelligence, profiles: TaskFixtures.profiles(), searchPause: .milliseconds(1))
        await model.load()
        model.select(sort: .michael)
        await TaskFixtures.until { model.list?.query.sort == .michael }
        #expect(intelligence.calls == [.priorities(1)])
        #expect(model.list?.tasks.first?.title == "Send the investor update")
        #expect(model.list?.ranking.values.contains { $0.rank == 1 } == true)
        #expect(tasks.lists.allSatisfy { $0.sort != .michael }, "Michael's order is not a server sort")
    }

    @Test func goalsLinkUpToFiveAndWaitForTheServer() async throws {
        let goals = try (1...6).map { try goal("g\($0)") }
        let intelligence = FakeTaskIntelligenceRepository(goals: goals)
        let model = TaskInsightsModel(taskID: "a", intelligence: intelligence)
        await model.load()
        for choice in model.goalChoices.prefix(5) { await model.toggle(choice) }
        #expect(model.linked?.count == 5)
        let sixth = try #require(model.goalChoices.last)
        #expect(!model.canLink(sixth))
        await model.toggle(sixth)
        #expect(model.linked?.count == 5)
        intelligence.fail(with: .validation(ServerMessage(text: "Link a task to at most 5 goals."), fields: ["goalIds": ["Too many"]]))
        let first = try #require(model.goalChoices.first)
        await model.toggle(first)
        #expect(model.linked?.count == 5, "a refused change leaves the links as the server has them")
        #expect(model.problem != nil)
    }

    @Test func aSuggestionStaysOneUntilConfirmed() async {
        let suggestion = Classification(
            id: "s1", category: Classification.Category(key: "personal.finance", name: "Personal finance", active: true), inferred: true,
            confidence: 0.82)
        let intelligence = FakeTaskIntelligenceRepository(suggestion: suggestion)
        let model = TaskInsightsModel(taskID: "a", intelligence: intelligence)
        await model.load()
        await model.suggest()
        #expect(model.suggestions.map(\.id) == ["s1"])
        #expect(model.confirmed.isEmpty)
        await model.confirm(suggestion)
        #expect(model.suggestions.isEmpty, "a confirmed suggestion shows once, as the user's")
        #expect(model.confirmed.map(\.category.key) == ["personal.finance"])
    }

    @Test func theDataUseNoticeAsksBeforeSuggestingAndNoFitSaysSo() async {
        let intelligence = FakeTaskIntelligenceRepository()
        let model = TaskInsightsModel(taskID: "a", intelligence: intelligence)
        await model.load()
        intelligence.fail(with: .validation(ServerMessage(text: "Confirm.", code: "DATA_USE_ACKNOWLEDGEMENT_REQUIRED"), fields: [:]))
        await model.suggest()
        #expect(model.needsAcknowledgement)
        #expect(model.problem == nil)
        await model.suggest(acknowledged: true)
        #expect(!model.needsAcknowledgement)
        #expect(model.noSuggestion)
        #expect(intelligence.calls.suffix(2) == [.suggest(false), .suggest(true)])
    }

    @Test func categoriesAreAddedAndRemovedAndTheMenuOffersTheRest() async throws {
        let intelligence = FakeTaskIntelligenceRepository()
        let model = TaskInsightsModel(taskID: "a", intelligence: intelligence)
        await model.load()
        let first = try #require(model.addable.first)
        let count = model.addable.count
        await model.classify(first)
        #expect(model.confirmed.count == 1)
        #expect(model.addable.count == count - 1)
        await model.remove(try #require(model.confirmed.first))
        #expect(model.confirmed.isEmpty)
    }
}
