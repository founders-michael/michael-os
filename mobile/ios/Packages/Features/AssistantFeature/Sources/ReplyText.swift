import DesignSystem
import SwiftUI

/// A reply in the format subset. The server sends one complete, already-checked message, so the word-by-word
/// reveal only paces how finished text appears: every word is laid out from the first frame and only its colour
/// changes, so nothing below it moves.
struct ReplyText: View {
    let lines: [ReplyLine]
    let reveal: Bool
    let onRevealed: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var started: Date?

    var body: some View {
        let words = ReplyReveal.words(in: lines)
        let step = ReplyReveal.step(forWords: words)
        Group {
            if reveal, !reduceMotion, let started {
                TimelineView(.animation) { context in
                    let elapsed = context.date.timeIntervalSince(started)
                    stack(visibleWords: step == 0 ? words : min(words, Int(elapsed / step) + 1))
                }
            } else {
                stack(visibleWords: reveal && !reduceMotion ? 0 : nil)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ReplyFormat.plain(lines))
        // A reply that leaves the screen mid-reveal is finished, not paused.
        .onDisappear { if reveal { onRevealed() } }
        .task(id: reveal) {
            guard reveal else { return }
            guard !reduceMotion else {
                onRevealed()
                return
            }
            started = .now
            try? await _Concurrency.Task.sleep(for: .seconds(step * Double(max(0, words - 1))))
            onRevealed()
        }
    }

    private func stack(visibleWords: Int?) -> some View {
        let starts = ReplyReveal.firstWords(of: lines)
        return VStack(alignment: .leading, spacing: MichaelSpace.sm) {
            ForEach(lines.indices, id: \.self) { index in
                line(lines[index], firstWord: starts[index], visibleWords: visibleWords)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func line(_ line: ReplyLine, firstWord: Int, visibleWords: Int?) -> some View {
        switch line {
        case .heading(let segments):
            Text(ReplyReveal.text(segments, firstWord: firstWord, visible: visibleWords, allBold: true))
                .michaelText(.body)
                .foregroundStyle(Color.michael.text)
                .padding(.top, MichaelSpace.xs)
        case .text(let segments):
            Text(ReplyReveal.text(segments, firstWord: firstWord, visible: visibleWords))
                .michaelText(.body)
                .foregroundStyle(Color.michael.text)
        case .bullet(let indent, let segments):
            marked("•", indent: indent, segments, firstWord: firstWord, visibleWords: visibleWords)
        case .numbered(let marker, let indent, let segments):
            marked(marker, indent: indent, segments, firstWord: firstWord, visibleWords: visibleWords)
        case .blank:
            Color.clear.frame(height: MichaelSpace.xs)
        }
    }

    private func marked(
        _ marker: String,
        indent: Int,
        _ segments: [ReplySegment],
        firstWord: Int,
        visibleWords: Int?
    ) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: MichaelSpace.sm) {
            Text(verbatim: marker)
                .michaelText(.body)
                .foregroundStyle(Color.michael.muted)
                .opacity(visibleWords.map { $0 > firstWord ? 1 : 0 } ?? 1)
            Text(ReplyReveal.text(segments, firstWord: firstWord, visible: visibleWords))
                .michaelText(.body)
                .foregroundStyle(Color.michael.text)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.leading, CGFloat(indent) * MichaelSpace.lg)
    }
}

enum ReplyReveal {
    /// The longest a reveal can take, with a margin for its last word.
    static let limit = Duration.seconds(MichaelMotion.replyRevealMax + MichaelMotion.progress)

    /// About 30 words a second, and never longer than the cap: a long reply is revealed faster per word.
    static func step(forWords words: Int) -> TimeInterval {
        let gaps = max(0, words - 1)
        return gaps == 0 ? 0 : min(MichaelMotion.replyWord, MichaelMotion.replyRevealMax / Double(gaps))
    }

    static func words(in lines: [ReplyLine]) -> Int {
        lines.reduce(0) { $0 + words(in: segments(of: $1)) }
    }

    static func firstWords(of lines: [ReplyLine]) -> [Int] {
        var next = 0
        return lines.map { line in
            defer { next += words(in: segments(of: line)) }
            return next
        }
    }

    /// The line's text with words from `visible` on drawn clear, so they keep their place.
    static func text(_ segments: [ReplySegment], firstWord: Int, visible: Int?, allBold: Bool = false) -> AttributedString {
        var result = AttributedString()
        var word = firstWord
        for segment in segments {
            for token in tokens(segment.text) {
                var piece = AttributedString(token.text)
                if segment.bold || allBold { piece.inlinePresentationIntent = .stronglyEmphasized }
                if token.isWord {
                    if let visible, word >= visible { piece.foregroundColor = .clear }
                    word += 1
                }
                result += piece
            }
        }
        return result
    }

    private static func segments(of line: ReplyLine) -> [ReplySegment] {
        switch line {
        case .heading(let segments), .text(let segments), .bullet(_, let segments), .numbered(_, _, let segments):
            segments
        case .blank:
            []
        }
    }

    private static func words(in segments: [ReplySegment]) -> Int {
        segments.reduce(0) { $0 + tokens($1.text).filter(\.isWord).count }
    }

    /// Words and the exact whitespace between them, so joining the tokens gives back the text.
    private static func tokens(_ text: String) -> [Token] {
        var tokens: [Token] = []
        for character in text {
            let isWord = !character.isWhitespace
            if let last = tokens.last, last.isWord == isWord {
                tokens[tokens.count - 1].text.append(character)
            } else {
                tokens.append(Token(text: String(character), isWord: isWord))
            }
        }
        return tokens
    }

    private struct Token {
        var text: String
        let isWord: Bool
    }
}
