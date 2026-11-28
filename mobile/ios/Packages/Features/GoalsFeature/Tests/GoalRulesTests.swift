import Foundation
import Models
import TestSupport
import Testing

@testable import GoalsFeature

struct GoalRulesTests {
    private func goal(_ name: String) throws -> Goal {
        try JSONDecoder.api().decode(GoalResponse.self, from: try ContractExamples.example(name)).goal
    }

    private func day(_ text: String) throws -> LocalDate { try #require(LocalDate(text)) }

    private func with(_ goal: Goal, progress: Int) -> Goal {
        Goal(
            id: goal.id, title: goal.title, description: goal.description, category: goal.category, status: goal.status,
            progress: progress, targetDate: goal.targetDate, completedAt: goal.completedAt, milestones: goal.milestones,
            milestoneCount: goal.milestoneCount, completedMilestoneCount: goal.completedMilestoneCount, createdAt: goal.createdAt,
            updatedAt: goal.updatedAt)
    }

    @Test func michaelsReadMatchesTheWebsRules() throws {
        let goal = try goal("goal-get.json")
        let read = GoalRead(goal, today: try day("2026-11-28"))
        #expect(read.milestonePercent == 33)
        #expect(read.standing == .inStep)
        #expect(read.nextMilestone == "My Day")
        #expect(!read.targetPassed)

        #expect(GoalRead(with(goal, progress: 80), today: try day("2026-11-28")).standing == .drift(ahead: true))
        #expect(GoalRead(with(goal, progress: 23), today: try day("2026-11-28")).standing == .drift(ahead: false))
        #expect(GoalRead(with(goal, progress: 24), today: try day("2026-11-28")).standing == .inStep)
        #expect(GoalRead(goal, today: try day("2027-03-01")).targetPassed)
    }

    @Test func aCompletedGoalsFormLeavesProgressOut() throws {
        let form = GoalForm(try goal("goal-complete.json"))
        let save = try #require(form.save)
        let body = try #require(String(bytes: try JSONEncoder().encode(save), encoding: .utf8))
        #expect(!body.contains("progress"))
        #expect(body.contains("\"targetDate\":null"))

        var open = GoalForm(try goal("goal-get.json"))
        open.title = "  "
        #expect(open.save == nil)
    }

    @Test func theTargetCountsDaysOnlyForAnActiveGoal() throws {
        let goal = try goal("goal-get.json")
        #expect(GoalTarget(goal, today: try day("2027-02-28")) == .today)
        #expect(GoalTarget(goal, today: try day("2027-02-19")) == .inDays(9))
        #expect(GoalTarget(goal, today: try day("2027-03-01")) == .passed(try day("2027-02-28")))
        #expect(GoalTarget(goal, today: try day("2026-11-28")) == .onDate(try day("2027-02-28")))
    }
}
