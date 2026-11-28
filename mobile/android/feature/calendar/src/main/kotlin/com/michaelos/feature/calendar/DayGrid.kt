package com.michaelos.feature.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.CalendarEvent
import com.michaelos.core.model.ProposedSession
import java.time.Instant
import java.time.LocalDate

/** What the grid draws: a saved event, or a session of the plan under review. */
sealed interface GridItem : Timed {
    val key: String

    data class Event(
        val event: CalendarEvent,
    ) : GridItem {
        override val key: String get() = "event-${event.id}"
        override val startAt: Instant get() = event.startAt
        override val endAt: Instant get() = event.endAt
    }

    data class Proposed(
        val session: ProposedSession,
        val title: String,
        val kept: Boolean,
    ) : GridItem {
        override val key: String get() = "proposed-${session.selectionId}"
        override val startAt: Instant get() = session.startAt
        override val endAt: Instant get() = session.endAt
    }
}

/** One day of 24 wall-clock hours on the profile's clock, opened an hour before the first item. */
@Composable
internal fun DayGrid(
    day: LocalDate,
    clock: ZonedClock,
    items: List<GridItem>,
    onEdit: (CalendarEvent) -> Unit,
    onToggle: (ProposedSession) -> Unit,
    modifier: Modifier = Modifier,
) {
    val placed = DayLayout.place(items, day, clock)
    val scroll = rememberScrollState()
    val hourPx = with(LocalDensity.current) { MichaelSize.calendarHour.toPx() }
    val first = DayLayout.firstMinute(placed.map { it.startMinute })
    // Again when the day's first item moves, so an event just added above the view comes into it.
    LaunchedEffect(day, first) { scroll.scrollTo((first / MINUTES_PER_HOUR * hourPx).toInt()) }
    BoxWithConstraints(modifier.fillMaxWidth().verticalScroll(scroll)) {
        val full = maxWidth
        val left = MichaelSize.calendarGutter + MichaelSpace.sm
        val width = full - left
        Box(Modifier.fillMaxWidth().height(MichaelSize.calendarHour * HOURS)) {
            Hours()
            placed.forEach { entry ->
                val columnWidth = width / entry.columns
                Box(
                    Modifier
                        .offset(x = left + columnWidth * entry.column, y = minutes(entry.startMinute) + MichaelSpace.xs / 2)
                        .width(columnWidth - MichaelSpace.xs)
                        .height(minutes(entry.endMinute - entry.startMinute) - MichaelSpace.xs),
                ) {
                    when (val item = entry.item) {
                        is GridItem.Event -> {
                            EventBlock(
                                item.event,
                                clock,
                                entry.endMinute - entry.startMinute < SHORT_MINUTES,
                            ) { onEdit(item.event) }
                        }

                        is GridItem.Proposed -> {
                            ProposedBlock(item, clock) { onToggle(item.session) }
                        }
                    }
                }
            }
            if (day == clock.today()) NowLine(minutes(clock.minuteOfDay(Instant.now())), full)
        }
    }
}

private fun minutes(count: Int): Dp = MichaelSize.calendarHour * (count.toFloat() / MINUTES_PER_HOUR)

@Composable
private fun Hours() {
    val colors = MichaelTheme.colors
    Column(Modifier.fillMaxWidth().clearAndSetSemantics {}) {
        repeat(HOURS) { hour ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .height(MichaelSize.calendarHour)
                    .drawBehind { drawLine(colors.border, start = Offset.Zero, end = Offset(size.width, 0f)) },
            ) {
                MichaelText(
                    CalendarFormat.hour(hour),
                    MichaelTextStyle.Caption,
                    colors.faint,
                    Modifier.width(MichaelSize.calendarGutter).padding(top = MichaelSpace.xs),
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun NowLine(
    y: Dp,
    width: Dp,
) {
    val accent = MichaelTheme.colors.accent
    Row(
        Modifier
            .offset(
                x = MichaelSize.calendarGutter,
                y = y - MichaelSpace.xs,
            ).width(width - MichaelSize.calendarGutter)
            .clearAndSetSemantics {},
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(MichaelSpace.sm).background(accent, CircleShape))
        Box(Modifier.weight(1f).height(MichaelSpace.xs / 2).background(accent))
    }
}

@Composable
private fun EventBlock(
    event: CalendarEvent,
    clock: ZonedClock,
    short: Boolean,
    onClick: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val kind = EventKind.of(event.eventType)
    val shape = RoundedCornerShape(MichaelRadius.button)
    val range = CalendarFormat.range(event.startAt, event.endAt, clock)
    val label = listOf(event.title, range, kind.label()).joinToString(", ")
    val background =
        when (kind) {
            EventKind.Commitment -> colors.infoBg
            EventKind.Unavailable, EventKind.Session -> colors.raise
        }
    var frame = Modifier.fillMaxSize().background(background, shape)
    if (kind != EventKind.Commitment) frame = frame.border(1.dp, if (kind == EventKind.Session) colors.border2 else colors.border, shape)
    if (kind == EventKind.Session) {
        frame =
            frame.drawBehind {
                drawRoundRect(
                    colors.accent,
                    size = size.copy(width = MichaelSpace.xs.toPx() * 2 / 3),
                    cornerRadius = CornerRadius(MichaelRadius.button.toPx()),
                )
            }
    }
    Column(
        frame
            .clickable(role = Role.Button, onClick = onClick)
            .clearAndSetSemantics {
                contentDescription = label
                role = Role.Button
                onClick { onClick().let { true } }
            }.padding(horizontal = MichaelSpace.md, vertical = MichaelSpace.xs),
    ) {
        val titleColor =
            when (kind) {
                EventKind.Commitment -> colors.info
                EventKind.Unavailable -> colors.muted
                EventKind.Session -> colors.text
            }
        MichaelText(event.title, MichaelTextStyle.Label, titleColor, maxLines = if (short) 1 else 2)
        if (!short) MichaelText("$range · ${kind.label()}", MichaelTextStyle.Caption, colors.muted, maxLines = 1)
    }
}

@Composable
private fun ProposedBlock(
    item: GridItem.Proposed,
    clock: ZonedClock,
    onClick: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val range = CalendarFormat.range(item.session.startAt, item.session.endAt, clock)
    val state = stringResource(if (item.kept) R.string.calendar_proposed_kept else R.string.calendar_proposed_dismissed)
    val stroke = if (item.kept) colors.chipBorder else colors.border2
    Column(
        Modifier
            .fillMaxSize()
            .background(if (item.kept) colors.chip else Color.Transparent, RoundedCornerShape(MichaelRadius.button))
            .drawBehind {
                val dash = MichaelSpace.xs.toPx()
                drawRoundRect(
                    stroke,
                    cornerRadius = CornerRadius(MichaelRadius.button.toPx()),
                    style = Stroke(width = 1.dp.toPx() * 3 / 2, pathEffect = PathEffect.dashPathEffect(floatArrayOf(dash, dash))),
                )
            }.clickable(role = Role.Button, onClick = onClick)
            .clearAndSetSemantics {
                contentDescription = "${item.title}, $range"
                stateDescription = state
                role = Role.Button
                onClick { onClick().let { true } }
            }.padding(horizontal = MichaelSpace.md, vertical = MichaelSpace.xs),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm), verticalAlignment = Alignment.CenterVertically) {
            MichaelText(
                item.title,
                MichaelTextStyle.Label,
                if (item.kept) colors.text else colors.faint,
                Modifier.weight(1f),
                maxLines = 1,
                textDecoration = if (item.kept) null else TextDecoration.LineThrough,
            )
            MichaelText(
                stringResource(if (item.kept) R.string.calendar_proposed_label else R.string.calendar_proposed_dismissed),
                MichaelTextStyle.Caption,
                if (item.kept) colors.atext else colors.faint,
            )
        }
        MichaelText(range, MichaelTextStyle.Caption, colors.muted, maxLines = 1)
    }
}

private const val HOURS = 24
private const val SHORT_MINUTES = 45
