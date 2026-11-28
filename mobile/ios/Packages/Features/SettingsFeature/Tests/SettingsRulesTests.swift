import Foundation
import Models
import TestSupport
import Testing

@testable import SettingsFeature

struct SettingsRulesTests {
    @Test func contextIsCountedAndSavedAsTheServerStoresIt() throws {
        let saved = try JSONDecoder.api().decode(PersonalContextResponse.self, from: try ContractExamples.example("context-put.json"))
            .context
        var draft = ContextDraft(saved)
        draft.text = "Mornings.\r\nNo calls before ten.  \n"
        #expect(draft.count == "Mornings.\nNo calls before ten.".count)
        let body = try #require(String(bytes: try JSONEncoder.api().encode(draft.save(over: draft.version)), encoding: .utf8))
        #expect(body.contains("\"expectedUpdatedAt\":\"2026-11-28T08:20:12.043Z\""))
        draft.text = String(repeating: "a", count: ContextDraft.limit + 1)
        #expect(draft.isTooLong)
    }

    @Test func namesAreCollapsedAndBounded() throws {
        let account = try JSONDecoder.api().decode(AccountResponse.self, from: try ContractExamples.example("account-get.json")).account
        var form = AccountForm(account)
        form.fullName = "  Sam   Rivera "
        #expect(form.save == AccountUpdate(fullName: "Sam Rivera", preferredName: "Sam"))
        form.preferredName = "   "
        #expect(form.save == nil)
        #expect(AccountForm.problem(String(repeating: "x", count: 81)) == .tooLong)
        #expect(!DeleteConfirmation.isReady(password: "secret", typed: "delete"))
        #expect(DeleteConfirmation.isReady(password: "secret", typed: "DELETE"))
    }
    @Test func availabilityRefusesOverlapsAndWindowsCrossingMidnight() throws {
        let saved = try JSONDecoder.api().decode(Availability.self, from: try ContractExamples.example("availability-put.json"))
        #expect(saved.windows.first?.id == nil)
        var plan = AvailabilityPlan(saved)
        let morning = plan.add(on: 2)
        let afternoon = plan.add(on: 2)
        #expect(morning != nil && afternoon != nil)
        guard let morning, let afternoon else { return }
        #expect(plan.save != nil)
        plan.update(afternoon) { $0.startTime = LocalTime(hour: 12, minute: 30) }
        #expect(plan.problem(afternoon) == .overlap)
        #expect(plan.problem(morning) == .overlap)
        #expect(plan.save == nil)
        plan.update(afternoon) { $0.startTime = LocalTime(hour: 17, minute: 0) }
        #expect(plan.problem(afternoon) == nil)
        plan.update(afternoon) { $0.endTime = LocalTime(hour: 2, minute: 0) }
        #expect(plan.problem(afternoon) == .order)
        plan.remove(afternoon)
        let save = try #require(plan.save)
        let body = try #require(String(bytes: try JSONEncoder.api().encode(save), encoding: .utf8))
        #expect(!body.contains("\"id\""))
    }

    @Test func routineSendsWorkHoursAsBothOrNeither() throws {
        let profile = try #require(
            try JSONDecoder.api().decode(ProfileResponse.self, from: try ContractExamples.example("profile-get.json")).profile)
        var form = RoutineForm(profile)
        form.hasWorkHours = false
        let routine = try #require(form.save)
        let body = try #require(String(bytes: try JSONEncoder.api().encode(routine), encoding: .utf8))
        #expect(body.contains("\"workStartTime\":null") && body.contains("\"workEndTime\":null"))
        #expect(!body.contains("preferredName"))
        form.hasWorkHours = true
        form.workStartTime = LocalTime(hour: 18, minute: 0)
        form.workEndTime = LocalTime(hour: 9, minute: 0)
        #expect(form.save == nil)
        form.priorities = []
        #expect(form.addPriority("  Health ") == nil)
        #expect(form.addPriority("health") == .duplicate)
        #expect(form.priorities == ["Health"])
    }

    @Test func picturesAreRecognisedByTheirBytes() {
        #expect(PictureRules.contentType(of: Data([0xFF, 0xD8, 0xFF, 0xE0])) == "image/jpeg")
        #expect(PictureRules.contentType(of: Data("<svg></svg>".utf8)) == nil)
        #expect(!PictureRules.isAccepted(Data([0xFF, 0xD8, 0xFF]) + Data(count: PictureRules.maxBytes)))
    }
}
