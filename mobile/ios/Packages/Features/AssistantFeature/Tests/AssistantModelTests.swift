import Foundation
import Models
import TestSupport
import Testing

@testable import AssistantFeature

@MainActor
struct AssistantModelTests {
    private let chat = ChatHarness()

    @Test func theFirstMessageCreatesTheConversationAndSendsNoHistory() async {
        chat.assistant.script(
            .event(.accepted), .event(.toolStart(name: "get_my_tasks")),
            .event(.toolEnd(name: "get_my_tasks", status: .completed)), .event(.composing), .event(.message(ChatHarness.reply))
        )
        let model = chat.model()
        await chat.sent(model, "  What first?  ")
        #expect(chat.assistant.sent == [ChatRequest(message: "What first?", conversationId: "new-1", dataUseAcknowledged: false)])
        #expect(chat.assistant.calls.filter { $0 == .create }.count == 1)
        let content = model.content
        #expect(content?.entries.count == 2)
        #expect(content?.revealing == content?.entries.last?.id)
        #expect(model.presence == .responding)
        #expect(model.composer.isEmpty)
        model.finishReveal(content?.entries.last?.id ?? "")
        #expect(model.presence == .idle)
    }

    @Test func theSecondMessageReusesTheConversation() async {
        chat.assistant.script(.event(.message(ChatHarness.reply)))
        chat.assistant.script(.event(.message(ChatHarness.reply)))
        let model = chat.model()
        await chat.sent(model, "One")
        await chat.sent(model, "Two")
        #expect(chat.assistant.sent.map(\.conversationId) == ["new-1", "new-1"])
        #expect(model.content?.entries.count == 4)
    }

    @Test func presenceFollowsTheStreamWhileTheReplyIsInFlight() async {
        let gate = ChatHarness.gate()
        chat.assistant.script(
            .event(.accepted), .event(.toolStart(name: "get_my_tasks")), .wait(gate.wait), .event(.message(ChatHarness.reply)))
        let model = chat.model()
        model.composer = "What first?"
        model.sendComposer()
        await chat.until { model.content?.turn?.progress.runningTool != nil }
        #expect(model.presence == .executing)
        #expect(model.content?.turn?.progress.line == "Reading your tasks")
        #expect(!model.canSend)
        model.composer = "Another"
        model.sendComposer()
        model.send("A suggestion")
        gate.release()
        await chat.until { model.content?.turn == nil }
        #expect(chat.assistant.sent.count == 1)
        #expect(model.composer == "Another")
    }

    @Test func anErrorEventAfterAcceptedShowsTheServersWordsAndRetrySendsAgain() async {
        chat.assistant.script(
            .event(.accepted),
            .event(.error(ChatStreamError(code: "AI_TIMEOUT", message: "Michael took too long to respond. Please retry."))))
        chat.assistant.script(.event(.message(ChatHarness.reply)))
        let model = chat.model()
        await chat.sent(model, "What first?")
        #expect(
            model.content?.failure
                == ChatFailure(message: "What first?", reason: "Michael took too long to respond. Please retry.", action: .retry))
        #expect(model.content?.entries.isEmpty == true)
        #expect(model.presence == .error)
        model.retry()
        await chat.until { model.content?.turn == nil }
        #expect(model.content?.failure == nil)
        #expect(chat.assistant.sent.map(\.message) == ["What first?", "What first?"])
    }

    @Test func aStreamEndingWithNeitherReplyNorErrorIsAnInterruption() async {
        chat.assistant.script(.event(.accepted), .event(.ping))
        let model = chat.model()
        await chat.sent(model, "What first?")
        #expect(model.content?.failure == .interrupted(message: "What first?"))
        #expect(model.content?.entries.isEmpty == true)
    }

    @Test func aProviderRateLimitWaitsBeforeRetrying() async {
        chat.assistant.script(
            .event(.accepted),
            .event(.error(ChatStreamError(code: "PROVIDER_RATE_LIMITED", message: "The AI provider is busy.", retryAfterSeconds: 30)))
        )
        let model = chat.model()
        await chat.sent(model, "What first?")
        model.retry()
        #expect(chat.assistant.sent.count == 1)
        chat.clock = chat.clock.addingTimeInterval(31)
        model.retry()
        await chat.until { model.content?.turn == nil }
        #expect(chat.assistant.sent.count == 2)
    }

    @Test func setupRequiredBeforeTheStreamOpensAsksToFinishSetup() async {
        chat.assistant.script(.refuse(.forbidden(ServerMessage(text: "Complete setup.", code: "LIFESTYLE_SETUP_REQUIRED"))))
        let model = chat.model()
        await chat.sent(model, "What first?")
        #expect(model.content?.failure?.action == .finishSetup)
    }

    @Test func aConversationThatCannotBeCreatedFailsTheSend() async {
        chat.assistant.fail(
            with: .conflict(ServerMessage(text: "Archive an older conversation first.", code: "CONVERSATION_LIMIT_REACHED")))
        let model = chat.model()
        await chat.sent(model, "What first?")
        #expect(model.content?.failure?.action == .openHistory)
        #expect(chat.assistant.sent.isEmpty)
    }

    @Test func theDataUseNoticeAsksOnceAndResendsWithTheAcknowledgement() async {
        chat.assistant.script(.refuse(.validation(ServerMessage(text: "Confirm.", code: "DATA_USE_ACKNOWLEDGEMENT_REQUIRED"), fields: [:])))
        chat.assistant.script(.event(.message(ChatHarness.reply)))
        chat.assistant.script(.event(.message(ChatHarness.reply)))
        let model = chat.model()
        await chat.sent(model, "What first?")
        #expect(model.content?.acknowledgement == "What first?")
        #expect(model.content?.failure == nil)
        #expect(!model.canSend)
        model.acknowledgeDataUse()
        await chat.until { model.content?.turn == nil }
        await chat.sent(model, "And then?")
        #expect(chat.assistant.sent.map(\.dataUseAcknowledged) == [false, true, true])
    }

    @Test func decliningTheNoticePutsTheMessageBackUnsent() async {
        chat.assistant.script(.refuse(.validation(ServerMessage(code: "DATA_USE_ACKNOWLEDGEMENT_REQUIRED"), fields: [:])))
        let model = chat.model()
        await chat.sent(model, "What first?")
        model.declineDataUse()
        #expect(model.composer == "What first?")
        #expect(model.content?.acknowledgement == nil)
        #expect(chat.assistant.sent.count == 1)
    }

    @Test func aMessageOverTheLimitCannotBeSent() {
        let model = chat.model()
        model.composer = String(repeating: "a", count: 4001)
        #expect(!model.canSend)
        model.sendComposer()
        #expect(chat.assistant.sent.isEmpty)
        model.composer = String(repeating: "a", count: 4000)
        #expect(model.canSend)
        // An emoji is two UTF-16 units, which is what the server counts.
        model.composer = String(repeating: "😀", count: 2001)
        #expect(model.composerCount == 4002 && !model.canSend)
    }

    @Test func aReplyClosedInTheBackgroundIsReadBackFromTheServer() async {
        let gate = ChatHarness.gate()
        chat.assistant.script(.event(.accepted), .wait(gate.wait), .event(.message(ChatHarness.reply)))
        let model = chat.model(grace: .zero)
        model.composer = "What first?"
        model.sendComposer()
        await chat.until { model.content?.turn?.progress.phase == .accepted }
        model.enterBackground()
        for _ in 0..<200 { await _Concurrency.Task.yield() }
        gate.release()
        chat.assistant.save("new-1", user: "What first?", reply: "Start with the investor update.")
        await model.enterForeground()
        #expect(model.content?.turn == nil)
        #expect(model.content?.failure == nil)
        #expect(model.content?.entries.count == 2)
    }

    @Test func aReplyClosedInTheBackgroundAndNeverSavedCanBeRetried() async {
        let gate = ChatHarness.gate()
        chat.assistant.script(.event(.accepted), .wait(gate.wait), .event(.message(ChatHarness.reply)))
        let model = chat.model(grace: .zero)
        model.composer = "What first?"
        model.sendComposer()
        await chat.until { model.content?.turn?.progress.phase == .accepted }
        model.enterBackground()
        for _ in 0..<200 { await _Concurrency.Task.yield() }
        gate.release()
        await model.enterForeground()
        #expect(model.content?.failure == .backgrounded(message: "What first?"))
        #expect(model.content?.turn == nil)
        // The server finished the turn after all: Try again finds the reply instead of asking twice.
        chat.assistant.save("new-1", user: "What first?", reply: "Start with the investor update.")
        model.retry()
        await chat.until { model.content?.entries.count == 2 }
        #expect(model.content?.failure == nil)
        #expect(chat.assistant.sent.count == 1)
        #expect(model.content?.entries.isEmpty == true)
    }

    @Test func aLongConversationOpensAtItsNewestMessagesAndLoadsEarlierOnes() async {
        let id = "long"
        let messages = (0..<230).map { index in
            ConversationMessage(
                id: "m\(index)", role: index.isMultiple(of: 2) ? .user : .assistant, content: "\(index)", toolActivity: [], createdAt: .now)
        }
        let conversation = Conversation(id: id, title: "Long", messageCount: 230, lastMessageAt: .now, archivedAt: nil, createdAt: .now)
        let assistant = FakeAssistantRepository(conversations: [conversation], messages: [id: messages])
        let model = AssistantModel(
            repositories: AssistantRepositories(
                assistant: assistant, tasks: chat.tasks, goals: chat.records, habits: chat.habits, calendar: chat.records,
                memories: chat.records
            )
        )
        await model.open(id, knownCount: 230)
        #expect(model.content?.entries.count == 130)
        #expect(model.content?.entries.first?.id == "m100")
        #expect(model.content?.earlierPage == 1)
        await model.loadEarlier()
        #expect(model.content?.entries.count == 230)
        #expect(model.content?.entries.first?.id == "m0")
        #expect(model.content?.earlierPage == nil)
    }

    @Test func aConversationThatCannotBeOpenedSaysSoAndCanBeRetried() async {
        let model = chat.model()
        await model.open("gone", knownCount: nil)
        guard case .failed(.notFound, "gone") = model.state else {
            Issue.record("Opening a deleted conversation fails")
            return
        }
        model.deleted("gone")
        #expect(model.content?.isEmpty == true)
    }

    @Test func aHandedOverQuestionStartsANewChatUnsent() async {
        chat.assistant.script(.event(.message(ChatHarness.reply)))
        let model = chat.model()
        await chat.sent(model, "What first?")
        model.prefill("Help me with my 2 overdue chat.tasks.")
        #expect(model.composer == "Help me with my 2 overdue chat.tasks.")
        #expect(model.content?.isEmpty == true && model.conversationID == nil)
        #expect(chat.assistant.sent.count == 1)
    }

    @Test func aQuestionHandedOverWhileMichaelWorksWaitsInTheComposer() async {
        let gate = ChatHarness.gate()
        chat.assistant.script(.event(.accepted), .wait(gate.wait), .event(.message(ChatHarness.reply)))
        let model = chat.model()
        model.composer = "What first?"
        model.sendComposer()
        await chat.until { model.content?.turn?.progress.phase == .accepted }
        model.prefill("Plan tomorrow")
        #expect(model.composer == "Plan tomorrow")
        #expect(model.content?.turn != nil)
        gate.release()
        await chat.until { model.content?.turn == nil }
        #expect(model.content?.entries.count == 2)
    }

    @Test func theServersTitleReplacesNewConversationAfterTheFirstExchange() async {
        chat.assistant.script(
            .event(.accepted), .wait { [assistant = chat.assistant] in assistant.save("new-1", user: "Plan my week", reply: "Done.") },
            .event(.message(ChatHarness.reply)))
        let model = chat.model()
        await chat.sent(model, "Plan my week")
        await chat.until { model.content?.conversation?.title == "Plan my week" }
        #expect(model.content?.conversation?.title == "Plan my week")
    }
}
