import Foundation
import Models
import TestSupport
import Testing

@testable import AssistantFeature

/// The fakes and helpers the chat model tests share.
@MainActor
final class ChatHarness {
    let assistant = FakeAssistantRepository()
    let tasks = FakeTaskRepository()
    let habits = FakeHabitRepository()
    let records = FakeRecordRepository()
    var clock = Date(timeIntervalSince1970: 1_800_000_000)

    func model(grace: Duration = .seconds(10)) -> AssistantModel {
        AssistantModel(
            repositories: AssistantRepositories(
                assistant: assistant,
                tasks: tasks,
                goals: records,
                habits: habits,
                calendar: records,
                memories: records
            ),
            now: { [unowned self] in clock },
            backgroundGrace: grace
        )
    }

    static func gate() -> (wait: @Sendable () async -> Void, release: () -> Void) {
        let (stream, continuation) = AsyncStream<Void>.makeStream()
        return ({ for await _ in stream { return } }, { continuation.yield() })
    }

    func until(_ condition: () -> Bool) async {
        for _ in 0..<10_000 where !condition() { await _Concurrency.Task.yield() }
    }

    static let reply = ChatReply(
        content: "**Start** with the investor update.",
        toolActivity: [ToolActivity(name: "get_my_tasks", status: .completed)],
        usedSavedData: true
    )

    static func draftReply(_ drafts: RecordDraft...) -> ChatEvent {
        .message(ChatReply(content: "Here is a draft. Press Save to add it.", toolActivity: [], usedSavedData: true, drafts: drafts))
    }

    func sent(_ model: AssistantModel, _ text: String) async {
        model.composer = text
        model.sendComposer()
        await until { model.content?.turn == nil }
    }

    func drafts(_ model: AssistantModel) -> [DraftCard] {
        model.content?.entries.flatMap { entry -> [DraftCard] in
            if case .michael(let reply) = entry.body { return reply.drafts }
            return []
        } ?? []
    }
}
