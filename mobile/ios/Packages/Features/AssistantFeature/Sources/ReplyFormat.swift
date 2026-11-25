import Foundation

// Mirrors the web app's src/lib/ai/reply-format.ts: headings, bullets, numbered items and **bold**, and nothing
// else. A reply can quote record titles the user typed, so no other syntax is interpreted and everything is shown
// as plain text.

nonisolated struct ReplySegment: Equatable {
    let text: String
    let bold: Bool
}

nonisolated enum ReplyLine: Equatable {
    case heading([ReplySegment])
    case text([ReplySegment])
    case bullet(indent: Int, [ReplySegment])
    case numbered(marker: String, indent: Int, [ReplySegment])
    case blank
}

nonisolated enum ReplyFormat {
    static func parse(_ text: String) -> [ReplyLine] {
        var lines: [ReplyLine] = []
        let normalised = text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        for raw in normalised.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(raw).trimmingTrailingWhitespace()
            if line.allSatisfy(\.isWhitespace) {
                // Runs of blank lines collapse into one gap.
                if let last = lines.last, last != .blank { lines.append(.blank) }
                continue
            }
            if let match = line.wholeMatch(of: heading) {
                lines.append(.heading(segments(String(match.1).replacingOccurrences(of: "**", with: ""))))
            } else if let match = line.wholeMatch(of: bullet) {
                lines.append(.bullet(indent: match.1.count >= 2 ? 1 : 0, segments(String(match.2))))
            } else if let match = line.wholeMatch(of: numbered) {
                lines.append(.numbered(marker: "\(match.2).", indent: match.1.count >= 2 ? 1 : 0, segments(String(match.3))))
            } else {
                lines.append(.text(segments(line)))
            }
        }
        while lines.last == .blank { lines.removeLast() }
        return lines
    }

    /// `**bold**` runs; an unmatched `**` stays as text.
    static func segments(_ text: String) -> [ReplySegment] {
        var result: [ReplySegment] = []
        var rest = text[...]
        while let match = rest.firstMatch(of: bold) {
            if match.range.lowerBound > rest.startIndex {
                result.append(ReplySegment(text: String(rest[rest.startIndex..<match.range.lowerBound]), bold: false))
            }
            result.append(ReplySegment(text: String(match.1), bold: true))
            rest = rest[match.range.upperBound...]
        }
        if !rest.isEmpty { result.append(ReplySegment(text: String(rest), bold: false)) }
        return result.filter { !$0.text.isEmpty }
    }

    /// The reply as clean text, for VoiceOver and Copy.
    static func plain(_ lines: [ReplyLine]) -> String {
        lines.map { line in
            switch line {
            case .blank: ""
            case .heading(let segments), .text(let segments): joined(segments)
            case .bullet(_, let segments): "• \(joined(segments))"
            case .numbered(let marker, _, let segments): "\(marker) \(joined(segments))"
            }
        }
        .joined(separator: "\n")
    }

    private static func joined(_ segments: [ReplySegment]) -> String {
        segments.map(\.text).joined()
    }

    // Computed: a Regex is not Sendable, so it cannot be a shared static. Literals are compiled at build time.
    private static var heading: Regex<(Substring, Substring)> { /\s{0,3}#{1,6}\s+(.+)/ }
    // swiftlint:disable large_tuple
    // A regex's output type is a tuple of its captures; these mirror the web's patterns exactly.
    private static var bullet: Regex<(Substring, Substring, Substring)> { /(\s*)[-*•]\s+(.+)/ }
    private static var numbered: Regex<(Substring, Substring, Substring, Substring)> { /(\s*)(\d{1,3})[.)]\s+(.+)/ }
    // swiftlint:enable large_tuple
    private static var bold: Regex<(Substring, Substring)> { /\*\*(.+?)\*\*/ }
}

nonisolated extension String {
    fileprivate func trimmingTrailingWhitespace() -> String {
        var end = endIndex
        while end > startIndex, self[index(before: end)].isWhitespace { end = index(before: end) }
        return String(self[startIndex..<end])
    }
}
