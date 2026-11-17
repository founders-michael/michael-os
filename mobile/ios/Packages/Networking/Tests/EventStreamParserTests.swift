import Foundation
import TestSupport
import Testing

@testable import Models
@testable import Networking

struct EventStreamParserTests {
    private func events(_ chunks: [some Sequence<UInt8>]) -> [ChatEvent] {
        var parser = EventStreamParser(log: { _ in })
        return chunks.flatMap { parser.push($0) }
    }

    @Test func savedStreamDecodesInOrder() throws {
        let bytes = Array(try ContractExamples.example("ai-chat-stream.sse"))
        let parsed = events([bytes])
        #expect(parsed.count == 6)
        #expect(
            Array(parsed.prefix(5)) == [
                .accepted, .toolStart(name: "get_daily_overview"),
                .toolEnd(name: "get_daily_overview", status: .completed), .composing, .ping,
            ])
        guard case .message(let reply) = parsed.last else {
            Issue.record("last event is not a message")
            return
        }
        #expect(reply.content.hasPrefix("Based on your daily overview"))
        #expect(reply.content.contains("9:30 AM – 6:00 PM"))
        #expect(reply.toolActivity == [ToolActivity(name: "get_daily_overview", status: .completed)])
        #expect(reply.usedSavedData)
    }

    @Test(arguments: ["ai-chat-stream.sse", "ai-chat-stream-draft.sse"])
    func everySplitPointGivesTheSameEvents(example: String) throws {
        let bytes = Array(try ContractExamples.example(example))
        let whole = events([bytes])
        #expect(!whole.isEmpty)
        for split in 0...bytes.count {
            #expect(events([bytes[..<split], bytes[split...]]) == whole, "split at \(split)")
        }
        #expect(events(bytes.map { [$0] }) == whole)
    }

    @Test func splitInsideMultiByteCharacter() {
        let frame = Array(#"data: {"type":"tool-start","name":"café – ✅"}"#.utf8) + Array("\n\n".utf8)
        let dash = frame.firstIndex(of: 0xE2) ?? 0
        #expect(events([frame[..<(dash + 1)], frame[(dash + 1)...]]) == [.toolStart(name: "café – ✅")])
    }

    @Test func crlfLineEndings() throws {
        let text = try #require(String(bytes: try ContractExamples.example("ai-chat-stream-draft.sse"), encoding: .utf8))
        let crlf = text.replacingOccurrences(of: "\n", with: "\r\n")
        #expect(events([Array(crlf.utf8)]) == events([Array(text.utf8)]))
    }

    @Test func unknownTypesAndCommentsAreIgnored() {
        let text = "data: {\"type\":\"reasoning\",\"text\":\"…\"}\n\n: keep-alive\n\nevent: x\nid: 4\ndata: {\"type\":\"accepted\"}\n\n"
        #expect(events([Array(text.utf8)]) == [.accepted])
    }

    @Test func dataLinesOfOneEventAreJoined() {
        let text = "data: {\"type\":\ndata: \"composing\"}\n\n"
        #expect(events([Array(text.utf8)]) == [.composing])
    }

    @Test func malformedKnownEventIsDroppedAndLogged() {
        let lines = LockedLines()
        var parser = EventStreamParser(log: lines.append)
        let parsed = parser.push(Array("data: {\"type\":\"tool-start\"}\n\ndata: {\"type\":\"ping\"}\n\n".utf8))
        #expect(parsed == [.ping])
        #expect(lines.all.count == 1)
    }

    @Test func errorEvent() {
        let text = #"data: {"type":"error","code":"AI_TIMEOUT","message":"Michael took too long.","retryAfterSeconds":5}"# + "\n\n"
        #expect(
            events([Array(text.utf8)]) == [
                .error(ChatStreamError(code: "AI_TIMEOUT", message: "Michael took too long.", retryAfterSeconds: 5))
            ])
    }

    @Test func streamClosingWithoutReplyYieldsNoMessage() throws {
        let bytes = Array(try ContractExamples.example("ai-chat-stream.sse"))
        let cut = events([bytes.dropLast(2)])
        #expect(
            cut == [
                .accepted, .toolStart(name: "get_daily_overview"), .toolEnd(name: "get_daily_overview", status: .completed), .composing,
                .ping,
            ])
    }
}
