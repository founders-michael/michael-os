package com.michaelos.feature.review

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.michaelos.core.designsystem.component.AICard
import com.michaelos.core.designsystem.component.ErrorBanner
import com.michaelos.core.designsystem.component.FailureStateView
import com.michaelos.core.designsystem.component.MichaelBackButton
import com.michaelos.core.designsystem.component.MichaelBackground
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonSize
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelCard
import com.michaelos.core.designsystem.component.MichaelChip
import com.michaelos.core.designsystem.component.MichaelChipTone
import com.michaelos.core.designsystem.component.MichaelIcons
import com.michaelos.core.designsystem.component.MichaelOrb
import com.michaelos.core.designsystem.component.MichaelOrbSize
import com.michaelos.core.designsystem.component.MichaelProgressBar
import com.michaelos.core.designsystem.component.StatTile
import com.michaelos.core.designsystem.component.michaelFieldFrame
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.DailyReview
import com.michaelos.core.model.ReviewTask
import com.michaelos.core.model.ReviewTime
import com.michaelos.core.model.ReviewWeek
import com.michaelos.core.model.Task

/** Where the review sends the user. */
class ReviewActions(
    /** Opens Michael with a request filled in. It is never sent on the user's behalf. */
    val ask: (String) -> Unit,
    val back: () -> Unit,
)

/** The Daily Review, pushed from More. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReviewScreen(
    actions: ReviewActions,
    viewModel: ReviewViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var picking by rememberSaveable { mutableStateOf<String?>(null) }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { viewModel.flush() }
    DisposableEffect(Unit) { onDispose { viewModel.flush() } }
    val screen = (state as? ReviewUiState.Content)?.screen
    MichaelBackground(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = MichaelSpace.sm), verticalAlignment = Alignment.CenterVertically) {
                MichaelBackButton(actions.back)
                MichaelText(
                    stringResource(R.string.review_title),
                    MichaelTextStyle.Label,
                    MichaelTheme.colors.text,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                screen?.let { SaveBadge(it.saveState) }
            }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when (val current = state) {
                    ReviewUiState.Loading -> {
                        val label = stringResource(R.string.review_loading)
                        CircularProgressIndicator(
                            Modifier.align(Alignment.Center).semantics { contentDescription = label },
                            color = MichaelTheme.colors.accent,
                        )
                    }

                    is ReviewUiState.Failed -> {
                        FailureStateView(current.error.message(), { viewModel.load() }, Modifier.align(Alignment.Center))
                    }

                    is ReviewUiState.Content -> {
                        PullToRefreshBox(isRefreshing = false, onRefresh = {
                            viewModel.flush()
                            viewModel.load()
                        }) { Page(current.screen, viewModel, actions) { picking = it } }
                    }
                }
            }
        }
    }
    val task =
        picking?.let { id ->
            screen
                ?.review
                ?.missedTasks
                ?.firstOrNull { it.task.id == id }
                ?.task
        }
    if (task != null && screen != null) {
        CarryForwardSheet(task, screen.review.date, screen.today, onMove = { viewModel.carryForward(task.id, it) }) { picking = null }
    }
}

@Composable
private fun SaveBadge(state: SaveState) {
    val colors = MichaelTheme.colors
    when (state) {
        SaveState.Saving -> {
            val label = stringResource(R.string.review_save_saving)
            CircularProgressIndicator(
                Modifier.padding(MichaelSpace.md).size(MichaelSize.check).semantics { contentDescription = label },
                color = colors.accent,
            )
        }

        SaveState.Saved -> {
            MichaelText(stringResource(R.string.review_save_saved), MichaelTextStyle.Label, colors.muted, Modifier.padding(MichaelSpace.md))
        }

        SaveState.Unsaved -> {
            MichaelText(
                stringResource(R.string.review_save_unsaved),
                MichaelTextStyle.Label,
                colors.faint,
                Modifier.padding(MichaelSpace.md),
            )
        }

        is SaveState.Failed -> {
            MichaelText(
                stringResource(R.string.review_save_failed),
                MichaelTextStyle.Label,
                colors.danger,
                Modifier.padding(MichaelSpace.md),
            )
        }
    }
}

@Composable
private fun Page(
    screen: ReviewScreenState,
    viewModel: ReviewViewModel,
    actions: ReviewActions,
    onPick: (String) -> Unit,
) {
    val review = screen.review
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.md),
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg),
    ) {
        item { DateBar(review, viewModel) }
        item { Overview(review) }
        item { LineCard(review, actions.ask) }
        item { Missed(screen, viewModel, onPick) }
        item {
            Section(stringResource(R.string.review_planned), review.plannedTasks.size, stringResource(R.string.review_planned_empty)) {
                review.plannedTasks.forEach { TaskLine(it.task.title, statusText(it.statusAtSelectedDate)) }
            }
        }
        item {
            Section(
                stringResource(R.string.review_completed),
                review.completedTasks.size,
                stringResource(R.string.review_completed_empty),
            ) {
                review.completedTasks.forEach { TaskLine(it.task.title, clockText(it.completedAt, review.timeZone)) }
            }
        }
        item { TimeCard(review.time) }
        item { Tomorrow(screen) }
        item { WeekCard(review.weekly) }
        reflection(screen, viewModel)
    }
}

@Composable
private fun DateBar(
    review: DailyReview,
    viewModel: ReviewViewModel,
) {
    val colors = MichaelTheme.colors
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconAction(MichaelIcons.chevronLeft, stringResource(R.string.review_previous)) { viewModel.showDays(-1) }
        MichaelText(
            longDayText(review.date),
            MichaelTextStyle.Heading,
            colors.text,
            Modifier.weight(1f).semantics { heading() },
            textAlign = TextAlign.Center,
        )
        IconAction(MichaelIcons.chevronRight, stringResource(R.string.review_next)) { viewModel.showDays(1) }
    }
}

@Composable
private fun Overview(review: DailyReview) {
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            StatTile(review.overview.planned.toString(), stringResource(R.string.review_stat_planned), Modifier.weight(1f))
            StatTile(
                review.overview.completed.toString(),
                stringResource(R.string.review_stat_completed),
                Modifier.weight(1f),
                highlighted = true,
            )
            StatTile(review.missedTasks.size.toString(), stringResource(R.string.review_stat_missed), Modifier.weight(1f))
        }
        MichaelProgressBar(review.overview.completionPercent / PERCENT)
        MichaelText(
            stringResource(R.string.review_percent, review.overview.completionPercent),
            MichaelTextStyle.Caption,
            MichaelTheme.colors.muted,
        )
    }
}

/** Michael's line: computed from the review; its actions fill Michael's composer. */
@Composable
private fun LineCard(
    review: DailyReview,
    ask: (String) -> Unit,
) {
    val date = review.date.toString()
    val plan =
        stringResource(
            if (review.missedTasks.size == 1) R.string.review_line_plan_prompt_one else R.string.review_line_plan_prompt_other,
            date,
        )
    val talk = stringResource(R.string.review_line_talk_prompt, date)
    AICard(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(MichaelSpace.md), horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            MichaelOrb(MichaelOrbSize.Small)
            Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
                MichaelText(lineText(ReviewLine.of(review)), MichaelTextStyle.Body, MichaelTheme.colors.text)
                if (review.missedTasks.isNotEmpty()) {
                    MichaelButton(stringResource(R.string.review_line_plan), { ask(plan) }, size = MichaelButtonSize.Small)
                }
                MichaelButton(
                    stringResource(R.string.review_line_talk),
                    { ask(talk) },
                    style = MichaelButtonStyle.Secondary,
                    size = MichaelButtonSize.Small,
                )
            }
        }
    }
}

@Composable
private fun Section(
    title: String,
    total: Int,
    empty: String,
    rows: @Composable () -> Unit,
) {
    val colors = MichaelTheme.colors
    Column {
        Row(Modifier.padding(bottom = MichaelSpace.xs)) {
            MichaelText(title, MichaelTextStyle.Eyebrow, colors.muted, Modifier.weight(1f).semantics { heading() })
            MichaelText(total.toString(), MichaelTextStyle.Caption, colors.muted)
        }
        if (total == 0) MichaelText(empty, MichaelTextStyle.Body, colors.faint, Modifier.padding(vertical = MichaelSpace.sm)) else rows()
    }
}

@Composable
private fun TaskLine(
    title: String,
    detail: String,
) {
    val colors = MichaelTheme.colors
    Column {
        Row(Modifier.padding(vertical = MichaelSpace.sm), verticalAlignment = Alignment.CenterVertically) {
            MichaelText(title, MichaelTextStyle.Body, colors.text, Modifier.weight(1f))
            MichaelText(detail, MichaelTextStyle.Caption, colors.muted)
        }
        HorizontalDivider(color = colors.border)
    }
}

@Composable
private fun Missed(
    screen: ReviewScreenState,
    viewModel: ReviewViewModel,
    onPick: (String) -> Unit,
) {
    val review = screen.review
    Section(stringResource(R.string.review_missed), review.missedTasks.size, stringResource(R.string.review_missed_empty)) {
        review.missedTasks.forEach { MissedRow(it, screen, viewModel, onPick) }
    }
}

/** A missed task: move it, keep it unscheduled, or mark it skipped on purpose. */
@Composable
private fun MissedRow(
    entry: ReviewTask,
    screen: ReviewScreenState,
    viewModel: ReviewViewModel,
    onPick: (String) -> Unit,
) {
    val colors = MichaelTheme.colors
    val id = entry.task.id
    val moved = screen.moved[id]
    val enabled = screen.busyTask == null
    val skipped = screen.draft.isSkipped(id)
    Column(Modifier.padding(vertical = MichaelSpace.sm), verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            MichaelText(entry.task.title, MichaelTextStyle.Body, colors.text, Modifier.weight(1f))
            if (entry.overdueAtSelectedDate) MichaelChip(stringResource(R.string.review_overdue), tone = MichaelChipTone.Warn)
        }
        if (moved != null) {
            MichaelText(movedText(moved), MichaelTextStyle.Caption, colors.atext)
        } else {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
                verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
            ) {
                MichaelButton(
                    stringResource(R.string.review_move_tomorrow),
                    { viewModel.carryForward(id, CarryForwardForm(CarryForwardForm.earliest(screen.review.date, screen.today))) },
                    size = MichaelButtonSize.Small,
                    enabled = enabled,
                )
                MichaelButton(
                    stringResource(R.string.review_move_pick),
                    { onPick(id) },
                    style = MichaelButtonStyle.Secondary,
                    size = MichaelButtonSize.Small,
                    enabled = enabled,
                )
                MichaelButton(
                    stringResource(if (skipped) R.string.review_skipped else R.string.review_skip),
                    { viewModel.toggleSkipped(id) },
                    style = MichaelButtonStyle.Ghost,
                    size = MichaelButtonSize.Small,
                    enabled = enabled,
                )
                MichaelButton(
                    stringResource(R.string.review_unschedule),
                    { viewModel.unschedule(id) },
                    style = MichaelButtonStyle.Ghost,
                    size = MichaelButtonSize.Small,
                    enabled = enabled,
                )
            }
        }
        screen.moveProblems[id]?.let { MichaelText(it.message(), MichaelTextStyle.Caption, colors.danger) }
        HorizontalDivider(color = colors.border)
    }
}

/** Scheduled time only. Actual time is not tracked, and nothing is inferred from the schedule. */
@Composable
private fun TimeCard(time: ReviewTime) {
    val colors = MichaelTheme.colors
    MichaelCard {
        Column(Modifier.padding(MichaelSpace.md), verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            MichaelText(stringResource(R.string.review_time), MichaelTextStyle.Eyebrow, colors.muted)
            TimeRow(
                stringResource(R.string.review_time_working),
                time.plannedWorkingMinutes?.let { durationText(it) } ?: stringResource(R.string.review_time_no_availability),
            )
            TimeRow(stringResource(R.string.review_time_tasks), durationText(time.scheduledTaskMinutes))
            TimeRow(stringResource(R.string.review_time_calendar), durationText(time.scheduledCalendarMinutes))
            TimeRow(stringResource(R.string.review_time_actual), stringResource(R.string.review_time_unavailable))
            MichaelText(stringResource(R.string.review_time_note), MichaelTextStyle.Caption, colors.faint)
        }
    }
}

@Composable
private fun TimeRow(
    label: String,
    value: String,
) {
    Row {
        MichaelText(label, MichaelTextStyle.Body, MichaelTheme.colors.muted, Modifier.weight(1f))
        MichaelText(value, MichaelTextStyle.Label, MichaelTheme.colors.text)
    }
}

@Composable
private fun Tomorrow(screen: ReviewScreenState) {
    val tomorrow = screen.review.tomorrow
    Section(
        stringResource(R.string.review_tomorrow, dayText(tomorrow.date)),
        tomorrow.incompleteTasks.size,
        stringResource(R.string.review_tomorrow_empty),
    ) {
        tomorrow.incompleteTasks.forEach { task: Task -> TaskLine(task.title, screen.moved[task.id]?.let { movedText(it) }.orEmpty()) }
    }
}

@Composable
private fun WeekCard(week: ReviewWeek) {
    val colors = MichaelTheme.colors
    MichaelCard {
        Column(Modifier.padding(MichaelSpace.md), verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            MichaelText(stringResource(R.string.review_week), MichaelTextStyle.Eyebrow, colors.muted)
            MichaelText(
                pluralStringResource(R.plurals.review_week_summary, week.planned, week.completed, week.planned, week.completionPercent),
                MichaelTextStyle.Body,
                colors.text,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
                week.days.forEach { day ->
                    val label =
                        pluralStringResource(R.plurals.review_week_day, day.planned, weekdayText(day.date), day.completed, day.planned)
                    Column(
                        Modifier.weight(1f).semantics(mergeDescendants = true) { contentDescription = label },
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs),
                    ) {
                        MichaelProgressBar(if (day.planned == 0) 0f else day.completed.toFloat() / day.planned)
                        MichaelText(weekdayText(day.date), MichaelTextStyle.Caption, colors.muted)
                    }
                }
            }
            MichaelText(
                pluralStringResource(
                    R.plurals.review_week_detail,
                    week.consistencyDays,
                    week.incomplete,
                    week.rescheduled,
                    week.consistencyDays,
                ),
                MichaelTextStyle.Caption,
                colors.muted,
            )
            MichaelText(
                pluralStringResource(
                    R.plurals.review_week_habits,
                    week.habits.consistencyPercent,
                    week.habits.completed,
                    week.habits.scheduled,
                    week.habits.consistencyPercent,
                ),
                MichaelTextStyle.Caption,
                colors.muted,
            )
        }
    }
}

/** The five reflection prompts, the web's wording. Saved as the user types. */
private fun LazyListScope.reflection(
    screen: ReviewScreenState,
    viewModel: ReviewViewModel,
) {
    item {
        val colors = MichaelTheme.colors
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
            MichaelText(
                stringResource(R.string.review_reflection),
                MichaelTextStyle.Eyebrow,
                colors.muted,
                Modifier.semantics { heading() },
            )
            MichaelText(stringResource(R.string.review_reflection_intro), MichaelTextStyle.Caption, colors.faint)
            (screen.saveState as? SaveState.Failed)?.let {
                ErrorBanner("${stringResource(R.string.review_save_failed_message)} ${it.error.message()}")
            }
        }
    }
    ReflectionDraft.Field.entries.forEach { field ->
        item(key = field.name) { ReflectionField(field, screen.draft[field]) { viewModel.edit(field, it) } }
    }
}

@Composable
private fun ReflectionField(
    field: ReflectionDraft.Field,
    value: String,
    onChange: (String) -> Unit,
) {
    val colors = MichaelTheme.colors
    val label = promptText(field)
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
        MichaelText(label, MichaelTextStyle.Label, colors.muted)
        BasicTextField(
            value = value,
            onValueChange = onChange,
            minLines = 3,
            maxLines = 8,
            textStyle = MichaelTextStyle.Body.textStyle.copy(color = colors.text),
            cursorBrush = SolidColor(colors.accent),
            modifier = Modifier.michaelFieldFrame().semantics { contentDescription = label },
            decorationBox = { inner ->
                Box {
                    if (value.isEmpty()) MichaelText(placeholderText(field), MichaelTextStyle.Body, colors.faint)
                    inner()
                }
            },
        )
    }
}

@Composable
internal fun IconAction(
    icon: ImageVector,
    label: String,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val colors = MichaelTheme.colors
    Box(
        Modifier
            .size(MichaelSize.checkTouch)
            .clickable(enabled = enabled, role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Image(icon, null, Modifier.size(MichaelSize.check), colorFilter = ColorFilter.tint(if (enabled) colors.atext else colors.faint))
    }
}

private const val PERCENT = 100f
