package com.michaelos.feature.assistant

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import com.michaelos.core.designsystem.theme.MichaelMotion
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import kotlinx.coroutines.delay
import kotlin.time.Duration.Companion.milliseconds

/**
 * A reply in the format subset. The server sends one complete, already-checked message, so the word-by-word reveal
 * only paces how finished text appears: every word is laid out from the first frame and only its colour changes, so
 * nothing below it moves.
 */
@Composable
internal fun ReplyText(
    lines: List<ReplyLine>,
    reveal: Boolean,
    onRevealed: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val reduceMotion = MichaelTheme.reduceMotion
    val words = remember(lines) { ReplyReveal.words(lines) }
    val animate = reveal && !reduceMotion
    var visible by remember(lines, animate) { mutableIntStateOf(if (animate) 0 else words) }
    LaunchedEffect(lines, reveal, reduceMotion) {
        if (!reveal) return@LaunchedEffect
        if (animate) {
            val step = ReplyReveal.stepMs(words)
            while (visible < words) {
                visible += 1
                if (step > 0) delay(step)
            }
        }
        onRevealed()
    }
    // A reply that leaves the screen mid-reveal is finished, not paused.
    DisposableEffect(lines, reveal) { onDispose { if (reveal) onRevealed() } }
    val starts = remember(lines) { ReplyReveal.firstWords(lines) }
    val plain = remember(lines) { ReplyFormat.plain(lines) }
    Column(
        modifier = modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = plain },
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
    ) {
        lines.forEachIndexed { index, line -> ReplyLineText(line, starts[index], if (animate) visible else null) }
    }
}

@Composable
private fun ReplyLineText(
    line: ReplyLine,
    firstWord: Int,
    visible: Int?,
) {
    val colors = MichaelTheme.colors
    val style = MichaelTextStyle.Body.textStyle.copy(color = colors.text)
    when (line) {
        ReplyLine.Blank -> {
            Spacer(Modifier.height(MichaelSpace.xs))
        }

        is ReplyLine.Heading -> {
            Text(
                ReplyReveal.text(line.segments, firstWord, visible, allBold = true),
                Modifier.padding(top = MichaelSpace.xs),
                style = style,
            )
        }

        is ReplyLine.Text -> {
            Text(ReplyReveal.text(line.segments, firstWord, visible), style = style)
        }

        is ReplyLine.Bullet -> {
            Marked("•", line.indent, line.segments, firstWord, visible)
        }

        is ReplyLine.Numbered -> {
            Marked(line.marker, line.indent, line.segments, firstWord, visible)
        }
    }
}

@Composable
private fun Marked(
    marker: String,
    indent: Int,
    segments: List<ReplySegment>,
    firstWord: Int,
    visible: Int?,
) {
    val colors = MichaelTheme.colors
    val shown = visible == null || visible > firstWord
    Row(Modifier.padding(start = MichaelSpace.lg * indent), horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        Text(marker, style = MichaelTextStyle.Body.textStyle.copy(color = if (shown) colors.muted else Color.Transparent))
        Text(ReplyReveal.text(segments, firstWord, visible), style = MichaelTextStyle.Body.textStyle.copy(color = colors.text))
    }
}

internal object ReplyReveal {
    /** The longest a reveal can take, with a margin for its last word. */
    val LIMIT = (MichaelMotion.REPLY_REVEAL_MAX_MS + MichaelMotion.PROGRESS_MS).milliseconds

    /** About 30 words a second, and never longer than the cap: a long reply is revealed faster per word. */
    fun stepMs(words: Int): Long {
        val gaps = maxOf(0, words - 1)
        return if (gaps == 0) 0 else minOf(MichaelMotion.REPLY_WORD_MS.toLong(), MichaelMotion.REPLY_REVEAL_MAX_MS.toLong() / gaps)
    }

    fun words(lines: List<ReplyLine>): Int = lines.sumOf { line -> line.segmentsOrEmpty.sumOf { tokens(it.text).count(Token::word) } }

    fun firstWords(lines: List<ReplyLine>): List<Int> {
        var next = 0
        return lines.map { line ->
            val first = next
            next += line.segmentsOrEmpty.sumOf { tokens(it.text).count(Token::word) }
            first
        }
    }

    /** The line's text with words from [visible] on drawn transparent, so they keep their place. */
    fun text(
        segments: List<ReplySegment>,
        firstWord: Int,
        visible: Int?,
        allBold: Boolean = false,
    ): AnnotatedString =
        buildAnnotatedString {
            var word = firstWord
            for (segment in segments) {
                for (token in tokens(segment.text)) {
                    val hidden = token.word && visible != null && word >= visible
                    if (token.word) word += 1
                    val weight = if (segment.bold || allBold) FontWeight.SemiBold else null
                    withStyle(SpanStyle(fontWeight = weight, color = if (hidden) Color.Transparent else Color.Unspecified)) {
                        append(token.text)
                    }
                }
            }
        }

    private data class Token(
        val text: String,
        val word: Boolean,
    )

    /** Words and the exact whitespace between them, so joining the tokens gives back the text. */
    private fun tokens(text: String): List<Token> {
        val tokens = mutableListOf<Token>()
        val current = StringBuilder()
        var inWord: Boolean? = null
        for (character in text) {
            val isWord = !character.isWhitespace()
            if (inWord != null && inWord != isWord) {
                tokens += Token(current.toString(), inWord)
                current.clear()
            }
            current.append(character)
            inWord = isWord
        }
        if (inWord != null) tokens += Token(current.toString(), inWord)
        return tokens
    }
}
