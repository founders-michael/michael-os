import Foundation
import Models

// Mirrors the web app's src/lib/ai/assistant-presence.ts. The orb shows what is actually happening: its state is
// derived from the stream events and a few facts about the screen, never chosen for effect.

/// Live progress for the one turn in flight.
struct TurnProgress: Equatable {
    enum Phase: Equatable {
        /// The message has left the phone and the stream has not opened yet.
        case sending
        case accepted
        case tool
        case composing
    }

    enum ToolRun: Equatable {
        case running
        case finished(ToolStatus)
    }

    struct Tool: Equatable {
        let name: String
        var run: ToolRun
    }

    var phase: Phase
    var tools: [Tool]

    static let sending = TurnProgress(phase: .sending, tools: [])
    static let accepted = TurnProgress(phase: .accepted, tools: [])

    var runningTool: Tool? { tools.first { $0.run == .running } }

    /// `message`, `error` and `ping` leave progress as it is: the first two end the turn and a ping means nothing.
    func advanced(by event: ChatEvent) -> TurnProgress {
        switch event {
        case .accepted:
            return phase == .sending ? .accepted : self
        case .toolStart(let name):
            return TurnProgress(phase: .tool, tools: tools + [Tool(name: name, run: .running)])
        case .toolEnd(let name, let status):
            let ended = tools.map { tool in
                tool.name == name && tool.run == .running ? Tool(name: name, run: .finished(status)) : tool
            }
            return TurnProgress(phase: .tool, tools: ended)
        case .composing:
            return TurnProgress(phase: .composing, tools: tools)
        case .ping, .message, .error:
            return self
        }
    }

    /// The one line saying what Michael is doing, true of the phase it describes: "Writing a reply" appears only
    /// once the server reports `composing`.
    var line: String {
        if let running = runningTool { return ToolLabel.of(running.name).doing }
        switch phase {
        case .sending: return String(localized: "presence.progress.sending", bundle: .module)
        case .composing: return String(localized: "presence.progress.composing", bundle: .module)
        case .accepted, .tool: return String(localized: "presence.progress.thinking", bundle: .module)
        }
    }
}

enum PresenceState: CaseIterable, Equatable {
    case idle, listening, thinking, executing, responding, awaitingApproval, error

    var label: String {
        switch self {
        case .idle: String(localized: "presence.idle", bundle: .module)
        case .listening: String(localized: "presence.listening", bundle: .module)
        case .thinking: String(localized: "presence.thinking", bundle: .module)
        case .executing: String(localized: "presence.executing", bundle: .module)
        case .responding: String(localized: "presence.responding", bundle: .module)
        case .awaitingApproval: String(localized: "presence.awaitingApproval", bundle: .module)
        case .error: String(localized: "presence.error", bundle: .module)
        }
    }

    /// The orb moves only while a request is in flight or a reply is being revealed.
    var isWorking: Bool { self == .thinking || self == .executing || self == .responding }
}

struct PresenceSignals: Equatable {
    /// Progress for a message sent whose reply has neither arrived nor failed; nil when nothing is in flight.
    var turn: TurnProgress?
    var revealing: Bool
    var failed: Bool
    /// Drafts shown and not yet saved or discarded.
    var pendingApprovals: Int
    /// The composer has focus and text.
    var userComposing: Bool

    /// Order is precedence. A turn that needs no tools never sends `composing`, so it stays `thinking` until the
    /// answer lands: one model call does both, and the app cannot honestly split it.
    var state: PresenceState {
        if let turn {
            if turn.runningTool != nil { return .executing }
            if turn.phase == .composing { return .responding }
            return .thinking
        }
        if revealing { return .responding }
        if failed { return .error }
        if pendingApprovals > 0 { return .awaitingApproval }
        if userComposing { return .listening }
        return .idle
    }
}
