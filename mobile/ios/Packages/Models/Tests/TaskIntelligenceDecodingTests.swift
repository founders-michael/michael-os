import Foundation
import TestSupport
import Testing

@testable import Models

struct TaskIntelligenceDecodingTests {
    private let decoder = JSONDecoder.api()

    private func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        try decoder.decode(type, from: try ContractExamples.example(name))
    }

    @Test func michaelsOrderCarriesEachTaskWithItsReasons() throws {
        let page = try decode(PrioritiesPage.self, "tasks-priorities.json")
        let first = try #require(page.tasks.first)
        #expect(first.rank == 1)
        #expect(first.task.title == "Send the investor update")
        let overdue = try #require(first.components.first { $0.name == "due_proximity" })
        #expect(overdue.reason.code == "OVERDUE")
        #expect(overdue.reason.numbers["days"] == 5)
        #expect(first.components.first { $0.name == "user_priority" }?.reason.strings["priority"] == "high")
        #expect(first.components.first { $0.name == "blocking_impact" }?.contribution == nil)
    }

    @Test func goalLinksTaxonomyAndClassifications() throws {
        #expect(try decode(GoalLinks.self, "task-goals-put.json").goals.first?.title == "Run a 10k")
        #expect(try decode(GoalList.self, "goals-active.json").goals.first?.status == .active)
        let categories = try decode(TaxonomyResponse.self, "taxonomy-lifestyle.json").categories
        #expect(categories.contains { $0.entityTypes.contains("TASK") })
        #expect(try decode(ClassificationList.self, "classifications-list.json").classifications.first?.inferred == false)
        let suggestion = try #require(try decode(SuggestionResponse.self, "classification-suggest.json").suggestion)
        #expect(suggestion.inferred)
        #expect(suggestion.confidence == 1)
        #expect(try decode(ClassificationResponse.self, "classification-confirm.json").classification.inferred == false)
    }
}
