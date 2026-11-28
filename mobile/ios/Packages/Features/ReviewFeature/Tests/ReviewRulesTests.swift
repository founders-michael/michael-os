import Foundation
import Models
import TestSupport
import Testing

@testable import ReviewFeature

struct ReviewRulesTests {
    private func day(_ text: String) throws -> LocalDate { try #require(LocalDate(text)) }

    private func review(_ name: String) throws -> DailyReview {
        try JSONDecoder.api().decode(DailyReview.self, from: try ContractExamples.example(name))
    }

    @Test func aMoveMustBeAfterTheReviewAndNotBeforeToday() throws {
        let review = try day("2026-11-20")
        let today = try day("2026-11-28")
        #expect(CarryForwardForm.earliest(review: review, today: today) == today)
        #expect(CarryForwardForm.earliest(review: today, today: today) == (try day("2026-11-29")))
        #expect(CarryForwardForm(date: try day("2026-11-27")).problem(review: review, today: today) == .tooEarly)
        #expect(CarryForwardForm(date: today).problem(review: review, today: today) == nil)
        let start = LocalTime(hour: 9, minute: 0)
        #expect(CarryForwardForm(date: today, startTime: start).problem(review: review, today: today) == .oneTime)
        #expect(CarryForwardForm(date: today, startTime: start, endTime: start).problem(review: review, today: today) == .endNotAfterStart)
    }

    @Test func theSaveIsBuiltFieldByFieldWithoutUpdatedAt() throws {
        let loaded = try review("review-today.json")
        var draft = ReflectionDraft(loaded.reflection)
        draft[.wentWell] = String(repeating: "a", count: ReflectionDraft.textLimit + 5)
        draft.toggleSkipped("task-1")
        let body = try #require(String(bytes: try JSONEncoder().encode(draft.save(for: loaded.date)), encoding: .utf8))
        #expect(!body.contains("updatedAt"))
        #expect(draft[.wentWell].count == ReflectionDraft.textLimit)
        #expect(draft.save(for: loaded.date).intentionallySkippedTaskIds == ["task-1"])
        #expect(ReviewLine(loaded) == .completed(done: 0, planned: 2, percent: 0, open: 2))
    }
}
