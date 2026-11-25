import Foundation
import Models
import TestSupport
import Testing

@testable import AssistantFeature

@MainActor
struct HistoryModelTests {
    private func conversation(_ index: Int, archived: Bool = false) -> Conversation {
        Conversation(
            id: "c\(index)",
            title: "Chat \(index)",
            messageCount: 2,
            lastMessageAt: .distantPast,
            archivedAt: archived ? .distantPast : nil,
            createdAt: .distantPast
        )
    }

    private func content(_ model: HistoryModel) -> HistoryModel.HistoryContent? {
        if case .content(let content) = model.state { return content }
        return nil
    }

    @Test func theFirstPageLoadsAndScrollingToTheEndLoadsTheNext() async {
        let model = HistoryModel(assistant: FakeAssistantRepository(conversations: (1...25).map { conversation($0) }))
        await model.load()
        #expect(content(model)?.conversations.count == 20)
        #expect(content(model)?.nextPage == 2)
        await model.loadMore()
        #expect(content(model)?.conversations.count == 25)
        #expect(content(model)?.nextPage == nil)
    }

    @Test func noConversationsIsEmptyAndAFailureCanBeRetried() async {
        let assistant = FakeAssistantRepository()
        let model = HistoryModel(assistant: assistant)
        await model.load()
        #expect(model.state == .empty)
        assistant.fail(with: .offline)
        await model.load()
        #expect(model.state == .failed(.offline))
    }

    @Test func renameUsesTheServersTitleAndArchiveMovesItToTheArchivedList() async {
        let assistant = FakeAssistantRepository(conversations: [conversation(1), conversation(2), conversation(3, archived: true)])
        let model = HistoryModel(assistant: assistant)
        await model.load()
        let renamed = await model.rename("c1", to: "  Plan the week  ")
        #expect(renamed?.title == "Plan the week")
        #expect(content(model)?.conversations.first?.title == "Plan the week")
        #expect(await model.setArchived("c2", true))
        #expect(content(model)?.conversations.map(\.id) == ["c1"])
        await model.show(.archived)
        #expect(Set(content(model)?.conversations.map(\.id) ?? []) == ["c2", "c3"])
        #expect(assistant.calls.contains(.update("c2", .archive(true))))
    }

    @Test func deleteWaitsForTheServerAndARefusalIsShown() async {
        let assistant = FakeAssistantRepository(conversations: [conversation(1), conversation(2)])
        let model = HistoryModel(assistant: assistant)
        await model.load()
        assistant.fail(with: .offline)
        #expect(await model.delete("c1") == false)
        #expect(content(model)?.error == "You're offline. Connect and try again.")
        #expect(content(model)?.conversations.count == 2)
        #expect(await model.delete("c1"))
        #expect(content(model)?.conversations.map(\.id) == ["c2"])
        #expect(await model.delete("c2"))
        #expect(model.state == .empty)
    }
}
