import Foundation
import Models

/// Turns the bytes of a `text/event-stream` body into chat events. Reads can split a frame, or a multi-byte
/// character, anywhere, so bytes are buffered until a whole line has arrived and decoded only when a blank
/// line ends the event. An event cut off by the end of the stream is never dispatched, as the SSE spec says.
public struct EventStreamParser: Sendable {
    private var line: [UInt8] = []
    private var data: [UInt8] = []
    private let log: @Sendable (String) -> Void

    public init(log: @escaping @Sendable (String) -> Void = APIClient.systemLog) {
        self.log = log
    }

    public mutating func push(_ bytes: some Sequence<UInt8>) -> [ChatEvent] {
        var events: [ChatEvent] = []
        for byte in bytes {
            if byte == UInt8(ascii: "\n") {
                if let event = endLine() { events.append(event) }
            } else {
                line.append(byte)
            }
        }
        return events
    }

    private mutating func endLine() -> ChatEvent? {
        if line.last == UInt8(ascii: "\r") { line.removeLast() }
        defer { line.removeAll(keepingCapacity: true) }
        if line.isEmpty { return dispatch() }
        guard line.starts(with: Self.dataField) else { return nil }
        var value = line.dropFirst(Self.dataField.count)
        if value.first == UInt8(ascii: " ") { value = value.dropFirst() }
        if !data.isEmpty { data.append(UInt8(ascii: "\n")) }
        data.append(contentsOf: value)
        return nil
    }

    private mutating func dispatch() -> ChatEvent? {
        guard !data.isEmpty else { return nil }
        defer { data.removeAll(keepingCapacity: true) }
        do {
            return try ChatEvent.decode(Data(data), using: JSONDecoder.api())
        } catch {
            log("Chat event did not match its model")
            return nil
        }
    }

    private static let dataField = Array("data:".utf8)
}
