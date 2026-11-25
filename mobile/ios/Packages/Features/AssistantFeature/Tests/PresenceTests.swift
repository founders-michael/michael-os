import Foundation
import Models
import TestSupport
import Testing

@testable import AssistantFeature
@testable import Networking

struct PresenceTests {
    private let quiet = PresenceSignals(turn: nil, revealing: false, failed: false, pendingApprovals: 0, userComposing: false)

    private func inFlight(_ progress: TurnProgress) -> PresenceState {
        PresenceSignals(turn: progress, revealing: false, failed: false, pendingApprovals: 0, userComposing: false).state
    }

    @Test func aTurnWithToolsMovesThroughItsPhasesAndKeepsEachOutcome() {
        var progress = TurnProgress.accepted
        progress = progress.advanced(by: .toolStart(name: "get_my_tasks"))
        #expect(progress == TurnProgress(phase: .tool, tools: [.init(name: "get_my_tasks", run: .running)]))
        progress = progress.advanced(by: .toolEnd(name: "get_my_tasks", status: .completed))
        progress = progress.advanced(by: .toolStart(name: "get_my_calendar"))
        progress = progress.advanced(by: .toolEnd(name: "get_my_calendar", status: .failed))
        progress = progress.advanced(by: .composing)
        #expect(
            progress
                == TurnProgress(
                    phase: .composing,
                    tools: [
                        .init(name: "get_my_tasks", run: .finished(.completed)), .init(name: "get_my_calendar", run: .finished(.failed)),
                    ]
                )
        )
    }

    @Test func pingMessageAndErrorLeaveProgressAndAcceptedNeverResetsATurn() {
        let running = TurnProgress(phase: .tool, tools: [.init(name: "get_my_goals", run: .running)])
        #expect(running.advanced(by: .ping) == running)
        #expect(running.advanced(by: .error(ChatStreamError(code: "X", message: "x"))) == running)
        #expect(running.advanced(by: .message(ChatReply(content: "hi", toolActivity: [], usedSavedData: false))) == running)
        #expect(running.advanced(by: .accepted) == running)
        #expect(TurnProgress.sending.advanced(by: .accepted) == .accepted)
    }

    @Test func inFlightARunningToolIsExecutingComposingIsRespondingAndTheRestIsThinking() {
        #expect(inFlight(.sending) == .thinking)
        #expect(inFlight(.accepted) == .thinking)
        #expect(inFlight(TurnProgress(phase: .tool, tools: [.init(name: "a", run: .running)])) == .executing)
        #expect(inFlight(TurnProgress(phase: .tool, tools: [.init(name: "a", run: .finished(.completed))])) == .thinking)
        #expect(inFlight(TurnProgress(phase: .composing, tools: [])) == .responding)
        let lookingAgain = TurnProgress.accepted.advanced(by: .composing).advanced(by: .toolStart(name: "get_my_habits"))
        #expect(inFlight(lookingAgain) == .executing)
    }

    @Test func beingInFlightOutranksEveryScreenFact() {
        let signals = PresenceSignals(turn: .accepted, revealing: true, failed: true, pendingApprovals: 2, userComposing: true)
        #expect(signals.state == .thinking)
    }

    @Test func afterTheReplyPrecedenceIsRevealErrorApprovalTypingIdle() {
        var signals = PresenceSignals(turn: nil, revealing: true, failed: true, pendingApprovals: 1, userComposing: true)
        #expect(signals.state == .responding)
        signals.revealing = false
        #expect(signals.state == .error)
        signals.failed = false
        #expect(signals.state == .awaitingApproval)
        signals.pendingApprovals = 0
        #expect(signals.state == .listening)
        #expect(quiet.state == .idle)
        #expect(!PresenceState.idle.isWorking && !PresenceState.awaitingApproval.isWorking && !PresenceState.error.isWorking)
    }

    @Test func everyStateHasALabel() {
        for state in PresenceState.allCases {
            #expect(!state.label.isEmpty && !state.label.contains("presence."), "\(state)")
        }
    }

    @Test func theProgressLineIsTrueOfItsPhase() {
        #expect(TurnProgress.sending.line == "Sending your message")
        #expect(TurnProgress.accepted.line == "Thinking")
        #expect(TurnProgress(phase: .tool, tools: [.init(name: "get_daily_overview", run: .running)]).line == "Looking over your day")
        #expect(TurnProgress(phase: .composing, tools: []).line == "Writing a reply")
        #expect(TurnProgress(phase: .tool, tools: [.init(name: "a_tool_from_later", run: .running)]).line == "Checking your information")
    }

    /// The saved stream, event by event, through the same derivation the screen uses.
    @Test func theSavedDraftStreamMapsToPresenceInOrder() throws {
        var parser = EventStreamParser(log: { _ in })
        let events = parser.push(try ContractExamples.example("ai-chat-stream-draft.sse"))
        var progress = TurnProgress.sending
        var states = [inFlight(progress)]
        for event in events {
            if case .message = event { break }
            progress = progress.advanced(by: event)
            states.append(inFlight(progress))
        }
        #expect(states == [.thinking, .thinking, .executing, .thinking, .responding])
    }

    @Test func everyLifestyleToolHasWordsAndTheTableCoversTheDeclarations() throws {
        let url = ContractExamples.directory.deletingLastPathComponent().deletingLastPathComponent()
            .appending(path: "shared/ai/tool-declarations.json")
        let declarations = try JSONDecoder().decode(Declarations.self, from: Data(contentsOf: url))
        let lifestyle = declarations.tools.filter { $0.product == "lifestyle" }.map(\.name)
        #expect(!lifestyle.isEmpty)
        #expect(Set(lifestyle) == Set(ToolLabel.kinds.keys))
        for name in lifestyle {
            let label = ToolLabel.of(name)
            #expect(![label.label, label.doing, label.detail].contains { $0.hasPrefix("tool.") }, "\(name)")
        }
    }

    private struct Declarations: Decodable {
        let tools: [Declaration]
    }

    private struct Declaration: Decodable {
        let name: String
        let product: String
    }
}
