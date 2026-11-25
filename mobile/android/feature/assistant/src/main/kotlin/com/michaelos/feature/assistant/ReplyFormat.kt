package com.michaelos.feature.assistant

// Mirrors the web app's src/lib/ai/reply-format.ts: headings, bullets, numbered items and **bold**, and nothing
// else. A reply can quote record titles the user typed, so no other syntax is interpreted and everything is shown as
// plain text.

data class ReplySegment(
    val text: String,
    val bold: Boolean,
)

sealed interface ReplyLine {
    data class Heading(
        val segments: List<ReplySegment>,
    ) : ReplyLine

    data class Text(
        val segments: List<ReplySegment>,
    ) : ReplyLine

    data class Bullet(
        val indent: Int,
        val segments: List<ReplySegment>,
    ) : ReplyLine

    data class Numbered(
        val marker: String,
        val indent: Int,
        val segments: List<ReplySegment>,
    ) : ReplyLine

    data object Blank : ReplyLine

    val segmentsOrEmpty: List<ReplySegment>
        get() =
            when (this) {
                is Heading -> segments
                is Text -> segments
                is Bullet -> segments
                is Numbered -> segments
                Blank -> emptyList()
            }
}

object ReplyFormat {
    private val heading = Regex("""^\s{0,3}#{1,6}\s+(.+)$""")
    private val bullet = Regex("""^(\s*)[-*•]\s+(.+)$""")
    private val numbered = Regex("""^(\s*)(\d{1,3})[.)]\s+(.+)$""")
    private val bold = Regex("""\*\*(.+?)\*\*""")

    fun parse(text: String): List<ReplyLine> {
        val lines = mutableListOf<ReplyLine>()
        for (raw in text.replace("\r\n", "\n").replace('\r', '\n').split('\n')) {
            val line = raw.trimEnd()
            if (line.isBlank()) {
                // Runs of blank lines collapse into one gap.
                if (lines.isNotEmpty() && lines.last() != ReplyLine.Blank) lines += ReplyLine.Blank
                continue
            }
            lines += classify(line)
        }
        while (lines.lastOrNull() == ReplyLine.Blank) lines.removeAt(lines.lastIndex)
        return lines
    }

    private fun classify(line: String): ReplyLine =
        heading.matchEntire(line)?.let { ReplyLine.Heading(segments(it.groupValues[1].replace("**", ""))) }
            ?: bullet.matchEntire(line)?.let { ReplyLine.Bullet(indentOf(it.groupValues[1]), segments(it.groupValues[2])) }
            ?: numbered.matchEntire(line)?.let {
                val (indent, number, rest) = it.destructured
                ReplyLine.Numbered("$number.", indentOf(indent), segments(rest))
            }
            ?: ReplyLine.Text(segments(line))

    /** `**bold**` runs; an unmatched `**` stays as text. */
    fun segments(text: String): List<ReplySegment> {
        val result = mutableListOf<ReplySegment>()
        var last = 0
        for (match in bold.findAll(text)) {
            if (match.range.first > last) result += ReplySegment(text.substring(last, match.range.first), bold = false)
            result += ReplySegment(match.groupValues[1], bold = true)
            last = match.range.last + 1
        }
        if (last < text.length) result += ReplySegment(text.substring(last), bold = false)
        return result.filter { it.text.isNotEmpty() }
    }

    /** The reply as clean text, for TalkBack and Copy. */
    fun plain(lines: List<ReplyLine>): String =
        lines.joinToString("\n") { line ->
            val text = line.segmentsOrEmpty.joinToString("") { it.text }
            when (line) {
                is ReplyLine.Bullet -> "• $text"
                is ReplyLine.Numbered -> "${line.marker} $text"
                else -> text
            }
        }

    private fun indentOf(leading: String) = if (leading.length >= 2) 1 else 0
}
