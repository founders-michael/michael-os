package com.michaelos.feature.assistant

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The cases of the web app's reply-format.test.ts. */
class ReplyFormatTest {
    @Test
    fun boldRunsAreSplitOutAndUnmatchedMarkersStayAsText() {
        assertEquals(
            listOf(ReplySegment("Due ", bold = false), ReplySegment("today", bold = true), ReplySegment(": 1", bold = false)),
            ReplyFormat.segments("Due **today**: 1"),
        )
        assertEquals(listOf(ReplySegment("2 ** 3", bold = false)), ReplyFormat.segments("2 ** 3"))
    }

    @Test
    fun headingsNestedBulletsNumberedItemsAndBlankLinesAreRecognised() {
        val lines = ReplyFormat.parse("## Today\n\n\n- **Tasks:**\n  - Call the dentist\n1. Walk\nDone.\n\n")
        assertEquals(
            listOf(
                ReplyLine.Heading(listOf(ReplySegment("Today", bold = false))),
                ReplyLine.Blank,
                ReplyLine.Bullet(0, listOf(ReplySegment("Tasks:", bold = true))),
                ReplyLine.Bullet(1, listOf(ReplySegment("Call the dentist", bold = false))),
                ReplyLine.Numbered("1.", 0, listOf(ReplySegment("Walk", bold = false))),
                ReplyLine.Text(listOf(ReplySegment("Done.", bold = false))),
            ),
            lines,
        )
    }

    @Test
    fun plainTextDropsTheMarkersForScreenReaders() {
        assertEquals("Plan\n• Walk at 7:00 AM", ReplyFormat.plain(ReplyFormat.parse("# Plan\n- **Walk** at 7:00 AM")))
    }

    @Test
    fun nothingOutsideTheSubsetIsInterpreted() {
        val text = "<b>[link](https://example.test)</b> `code` _under_ ![x](y) ‮rtl"
        assertEquals(listOf(ReplyLine.Text(listOf(ReplySegment(text, bold = false)))), ReplyFormat.parse(text))
    }

    @Test
    fun aLongReplyIsRevealedWithinTheCap() {
        assertEquals(0L, ReplyReveal.stepMs(1))
        assertEquals(34L, ReplyReveal.stepMs(10))
        assertTrue(ReplyReveal.stepMs(2000) * 1999 <= 3000)
    }
}
