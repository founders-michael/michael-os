import Testing

@testable import AssistantFeature

/// The cases of the web app's reply-format.test.ts.
struct ReplyFormatTests {
    @Test func boldRunsAreSplitOutAndUnmatchedMarkersStayAsText() {
        #expect(
            ReplyFormat.segments("Due **today**: 1")
                == [
                    ReplySegment(text: "Due ", bold: false), ReplySegment(text: "today", bold: true),
                    ReplySegment(text: ": 1", bold: false),
                ]
        )
        #expect(ReplyFormat.segments("2 ** 3") == [ReplySegment(text: "2 ** 3", bold: false)])
    }

    @Test func headingsNestedBulletsNumberedItemsAndBlankLinesAreRecognised() {
        let lines = ReplyFormat.parse("## Today\n\n\n- **Tasks:**\n  - Call the dentist\n1. Walk\nDone.\n\n")
        #expect(lines.count == 6)
        #expect(lines[0] == .heading([ReplySegment(text: "Today", bold: false)]))
        #expect(lines[1] == .blank)
        #expect(lines[2] == .bullet(indent: 0, [ReplySegment(text: "Tasks:", bold: true)]))
        #expect(lines[3] == .bullet(indent: 1, [ReplySegment(text: "Call the dentist", bold: false)]))
        #expect(lines[4] == .numbered(marker: "1.", indent: 0, [ReplySegment(text: "Walk", bold: false)]))
        #expect(lines[5] == .text([ReplySegment(text: "Done.", bold: false)]))
    }

    @Test func plainTextDropsTheMarkersForScreenReaders() {
        #expect(ReplyFormat.plain(ReplyFormat.parse("# Plan\n- **Walk** at 7:00 AM")) == "Plan\n• Walk at 7:00 AM")
    }

    @Test func nothingOutsideTheSubsetIsInterpreted() {
        let text = "<b>[link](https://example.test)</b> `code` _under_ ![x](y) \u{202E}rtl"
        #expect(ReplyFormat.parse(text) == [.text([ReplySegment(text: text, bold: false)])])
    }

    @Test func aLongReplyIsRevealedWithinTheCap() {
        #expect(ReplyReveal.step(forWords: 1) == 0)
        #expect(ReplyReveal.step(forWords: 10) == 0.034)
        let words = 2000
        #expect(ReplyReveal.step(forWords: words) * Double(words - 1) <= 3.0 + 1e-9)
    }
}
