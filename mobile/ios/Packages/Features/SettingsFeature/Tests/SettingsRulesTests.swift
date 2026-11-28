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
}
