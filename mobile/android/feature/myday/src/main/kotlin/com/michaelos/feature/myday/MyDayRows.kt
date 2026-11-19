package com.michaelos.feature.myday

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonSize
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelCheck
import com.michaelos.core.designsystem.component.MichaelChip
import com.michaelos.core.designsystem.component.MichaelChipTone
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.TaskStatus
import com.michaelos.core.model.TimelineItem

@Composable
private fun SectionTitle(text: String) {
    MichaelText(
        text,
        MichaelTextStyle.Heading,
        MichaelTheme.colors.text,
        Modifier.padding(top = MichaelSpace.sm).semantics { heading() },
    )
}

/** A section the server could not load. The rest of the day is still shown. */
@Composable
private fun SectionFailure(
    message: String,
    onRetry: () -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm), verticalAlignment = Alignment.CenterVertically) {
        MichaelText(message, MichaelTextStyle.Label, MichaelTheme.colors.muted, Modifier.weight(1f))
        MichaelButton(
            stringResource(R.string.myday_section_retry),
            onRetry,
            style = MichaelButtonStyle.Ghost,
            size = MichaelButtonSize.Small,
        )
    }
}

@Composable
private fun Quiet(text: String) {
    MichaelText(text, MichaelTextStyle.Label, MichaelTheme.colors.muted)
}

@Composable
internal fun TimelineSection(
    day: MyDayContent,
    format: MyDayFormat,
    onOpenCalendar: () -> Unit,
    onRetry: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        SectionTitle(stringResource(R.string.myday_timeline_title))
        val items = day.myDay.timeline
        if (items == null) {
            SectionFailure(stringResource(R.string.myday_timeline_failed), onRetry)
            return@Column
        }
        if (items.isEmpty()) Quiet(stringResource(R.string.myday_timeline_clear))
        items.forEach { TimelineRow(it, day.taskStatus(it), day.myDay.timeZone, format) }
        if (day.myDay.timelineTruncated == true) {
            MichaelButton(
                stringResource(R.string.myday_timeline_more),
                onOpenCalendar,
                style = MichaelButtonStyle.Ghost,
                size = MichaelButtonSize.Small,
            )
        }
    }
}

@Composable
private fun TimelineRow(
    item: TimelineItem,
    status: TaskStatus?,
    timeZone: String,
    format: MyDayFormat,
) {
    val colors = MichaelTheme.colors
    val shape = RoundedCornerShape(MichaelRadius.stat)
    val rail =
        when (item.kind) {
            TimelineItem.Kind.Focus -> colors.accent
            TimelineItem.Kind.Commitment -> colors.accent2
            TimelineItem.Kind.Unavailable, TimelineItem.Kind.Unknown -> colors.border2
        }
    val statusLabel = status?.label()
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .height(IntrinsicSize.Min)
                .background(colors.surface, shape)
                .border(1.dp, colors.border, shape)
                .padding(MichaelSpace.md)
                .semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.md),
    ) {
        Box(Modifier.width(MichaelSpace.xs).fillMaxHeight().background(rail, RoundedCornerShape(MichaelRadius.pill)))
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
            MichaelText(format.timeRange(item.startAt, item.endAt, timeZone), MichaelTextStyle.Caption, colors.muted)
            MichaelText(
                if (statusLabel == null) item.label else stringResource(R.string.myday_timeline_label_with_status, item.label, statusLabel),
                MichaelTextStyle.Caption,
                colors.faint,
            )
            MichaelText(item.title, MichaelTextStyle.Body, colors.text)
            item.description?.takeIf { it.isNotEmpty() }?.let {
                MichaelText(
                    it,
                    MichaelTextStyle.Label,
                    colors.muted,
                    maxLines = DESCRIPTION_LINES,
                )
            }
        }
    }
}

@Composable
internal fun TasksSection(
    day: MyDayContent,
    onToggle: (String) -> Unit,
    onRetry: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
        SectionTitle(stringResource(R.string.myday_tasks_title))
        when {
            day.myDay.tasks == null -> SectionFailure(stringResource(R.string.myday_tasks_failed), onRetry)
            day.tasks.isEmpty() -> Quiet(stringResource(R.string.myday_tasks_none))
            else -> day.tasks.forEach { row -> TaskRow(row) { onToggle(row.id) } }
        }
    }
}

@Composable
private fun TaskRow(
    row: MyDayTaskRow,
    onToggle: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val label =
        if (row.isDone) {
            stringResource(R.string.myday_task_reopen, row.task.title)
        } else {
            stringResource(R.string.myday_task_complete, row.task.title)
        }
    val chip: (@Composable () -> Unit)? =
        when {
            row.status == null -> {
                { MichaelChip(stringResource(R.string.myday_task_status_unavailable)) }
            }

            row.isOverdue -> {
                { MichaelChip(stringResource(R.string.myday_task_overdue), tone = MichaelChipTone.Danger) }
            }

            row.status == TaskStatus.InProgress -> {
                { MichaelChip(stringResource(R.string.myday_status_in_progress)) }
            }

            else -> {
                null
            }
        }
    Column {
        CheckRow(row.isDone, label, row.canToggle, onToggle, trailing = chip) {
            MichaelText(
                row.task.title,
                MichaelTextStyle.Body,
                if (row.isDone) colors.faint else colors.text,
                textDecoration = if (row.isDone) TextDecoration.LineThrough else null,
            )
        }
        row.rollback?.let { RollbackNotice(it.message(), onToggle) }
    }
}

@Composable
internal fun HabitsSection(
    day: MyDayContent,
    onToggle: (String) -> Unit,
    onRetry: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
        SectionTitle(stringResource(R.string.myday_habits_title))
        when {
            day.myDay.habits == null -> {
                SectionFailure(stringResource(R.string.myday_habits_failed), onRetry)
            }

            day.habits.isEmpty() -> {
                Quiet(stringResource(R.string.myday_habits_none))
            }

            else -> {
                if (day.isReadOnly) {
                    MichaelText(stringResource(R.string.myday_habits_read_only), MichaelTextStyle.Caption, MichaelTheme.colors.faint)
                }
                day.habits.forEach { row -> HabitRow(row) { onToggle(row.id) } }
            }
        }
    }
}

@Composable
private fun HabitRow(
    row: MyDayHabitRow,
    onToggle: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val label =
        if (row.isDone) {
            stringResource(R.string.myday_habit_undo, row.habit.title)
        } else {
            stringResource(R.string.myday_habit_check_in, row.habit.title)
        }
    val streak: (@Composable () -> Unit)? =
        if (row.habit.currentStreak > 0) {
            { MichaelText(stringResource(R.string.myday_habit_streak, row.habit.currentStreak), MichaelTextStyle.Caption, colors.muted) }
        } else {
            null
        }
    Column {
        CheckRow(row.isDone, label, row.canToggle, onToggle, trailing = streak) {
            MichaelText(row.habit.title, MichaelTextStyle.Body, colors.text)
        }
        row.rollback?.let { RollbackNotice(it.message(), onToggle) }
    }
}

// Past this font scale the title needs the full width, so the chip moves under it instead of breaking it mid-word.
private const val STACK_FONT_SCALE = 1.5f

@Composable
private fun CheckRow(
    checked: Boolean,
    label: String,
    enabled: Boolean,
    onToggle: () -> Unit,
    trailing: (@Composable () -> Unit)?,
    text: @Composable () -> Unit,
) {
    val stacked = LocalDensity.current.fontScale >= STACK_FONT_SCALE
    Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm), verticalAlignment = Alignment.CenterVertically) {
        MichaelCheck(checked, label, onCheckedChange = { onToggle() }, enabled = enabled)
        if (stacked) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
                text()
                trailing?.invoke()
            }
        } else {
            Box(Modifier.weight(1f)) { text() }
            trailing?.invoke()
        }
    }
}

/** A change the server refused: the row is back as it was, and this says so beside it. */
@Composable
private fun RollbackNotice(
    message: String,
    onRetry: () -> Unit,
) {
    Row(
        modifier =
            Modifier
                .padding(start = MichaelSize.checkTouch + MichaelSpace.sm)
                .semantics { liveRegion = LiveRegionMode.Polite },
        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MichaelText(message, MichaelTextStyle.Caption, MichaelTheme.colors.danger, Modifier.weight(1f))
        MichaelButton(
            stringResource(R.string.myday_rollback_retry),
            onRetry,
            style = MichaelButtonStyle.Ghost,
            size = MichaelButtonSize.Small,
        )
    }
}

private const val DESCRIPTION_LINES = 3
