package com.michaelos.feature.myday

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.michaelos.core.designsystem.component.AICard
import com.michaelos.core.designsystem.component.EmptyStateView
import com.michaelos.core.designsystem.component.ErrorBanner
import com.michaelos.core.designsystem.component.FailureStateView
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
import com.michaelos.core.designsystem.component.OfflineBanner
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.DailyTaskSummary
import com.michaelos.core.model.MyDayNotice
import com.michaelos.core.model.TimelineItem
import java.time.Instant

/** Where My Day sends the user. Each opens another tab; none of them saves anything. */
class MyDayActions(
    /** Opens Michael with the notice's question filled in. It is never sent on the user's behalf. */
    val ask: (String?) -> Unit,
    val addTask: () -> Unit,
    val openCalendar: () -> Unit,
)

@Composable
fun MyDayScreen(
    actions: MyDayActions,
    viewModel: MyDayViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_START) { viewModel.appear() }
    val haptics = LocalHapticFeedback.current
    val rollbacks =
        when (val current = state) {
            is MyDayUiState.Content -> current.day.rollbacks.size
            is MyDayUiState.Empty -> current.day.rollbacks.size
            else -> 0
        }
    var rollbacksSeen by remember { mutableIntStateOf(0) }
    LaunchedEffect(rollbacks) {
        if (rollbacks > rollbacksSeen) haptics.performHapticFeedback(HapticFeedbackType.Reject)
        rollbacksSeen = rollbacks
    }
    MichaelBackground(Modifier.fillMaxSize()) {
        when (val current = state) {
            MyDayUiState.Loading -> {
                MyDaySkeleton()
            }

            is MyDayUiState.Failed -> {
                FailureStateView(current.error.loadMessage(), viewModel::load, Modifier.align(Alignment.Center))
            }

            is MyDayUiState.Content -> {
                MyDayContentView(current.day, isEmpty = false, viewModel, actions)
            }

            is MyDayUiState.Empty -> {
                MyDayContentView(current.day, isEmpty = true, viewModel, actions)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MyDayContentView(
    day: MyDayContent,
    isEmpty: Boolean,
    viewModel: MyDayViewModel,
    actions: MyDayActions,
) {
    val format = rememberMyDayFormat()
    PullToRefreshBox(isRefreshing = day.isRefreshing, onRefresh = viewModel::refresh, modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.lg),
            verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg),
        ) {
            day.refreshProblem?.let { problem ->
                item(key = "problem") {
                    val time = format.time(day.loadedAt, day.myDay.timeZone)
                    if (problem.isConnectionProblem) {
                        OfflineBanner(stringResource(R.string.myday_offline, time), viewModel::refresh)
                    } else {
                        ErrorBanner(stringResource(R.string.myday_refresh_failed, time))
                    }
                }
            }
            item(key = "header") { MyDayHeader(day, format, onStep = viewModel::step, onToday = viewModel::showToday) }
            if (day.myDay.notices.isNotEmpty()) {
                item(key = "notices") { NoticesCard(day.myDay.notices, actions.ask) }
            }
            if (isEmpty) {
                item(key = "empty") {
                    EmptyStateView(
                        title = stringResource(if (day.isToday) R.string.myday_empty_title else R.string.myday_empty_title_other_day),
                        message = stringResource(R.string.myday_empty_message),
                        actionText = stringResource(R.string.myday_empty_action),
                        onAction = actions.addTask,
                        modifier = Modifier.padding(vertical = MichaelSpace.xl),
                    )
                }
            } else {
                sections(day, format, viewModel, actions)
            }
        }
    }
}

private fun LazyListScope.sections(
    day: MyDayContent,
    format: MyDayFormat,
    viewModel: MyDayViewModel,
    actions: MyDayActions,
) {
    val summary = day.myDay.tasks?.dailySummary
    if (summary != null && summary.total > 0) {
        item(key = "progress") { ProgressCard(summary, day.isToday, day.nextItem(Instant.now()), day.myDay.timeZone, format) }
    }
    item(key = "timeline") { TimelineSection(day, format, actions.openCalendar, viewModel::refresh) }
    item(key = "tasks") { TasksSection(day, viewModel::toggleTask, viewModel::refresh) }
    item(key = "habits") { HabitsSection(day, viewModel::toggleHabit, viewModel::refresh) }
}

@Composable
private fun MyDayHeader(
    day: MyDayContent,
    format: MyDayFormat,
    onStep: (Long) -> Unit,
    onToday: () -> Unit,
) {
    val colors = MichaelTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        MichaelText(format.date(day.myDay.selectedDate), MichaelTextStyle.Eyebrow, colors.faint)
        MichaelText(
            stringResource(R.string.myday_greeting, day.myDay.greeting, day.myDay.greetingName),
            MichaelTextStyle.Display,
            colors.text,
            Modifier.semantics { heading() },
        )
        val briefing = day.myDay.briefing
        if (day.isToday && briefing != null) MichaelText(briefing, MichaelTextStyle.Body, colors.muted)
        Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm), verticalAlignment = Alignment.CenterVertically) {
            StepButton(MichaelIcons.chevronLeft, stringResource(R.string.myday_previous_day)) { onStep(-1) }
            MichaelButton(
                stringResource(R.string.myday_today),
                onToday,
                style = MichaelButtonStyle.Ghost,
                enabled = !day.isToday,
                size = MichaelButtonSize.Small,
            )
            StepButton(MichaelIcons.chevronRight, stringResource(R.string.myday_next_day)) { onStep(1) }
        }
    }
}

@Composable
private fun StepButton(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
) {
    Box(
        modifier =
            Modifier
                .minimumInteractiveComponentSize()
                .size(MichaelSize.checkTouch)
                .clickable(role = Role.Button, onClick = onClick)
                .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Image(icon, contentDescription = null, colorFilter = ColorFilter.tint(MichaelTheme.colors.muted))
    }
}

@Composable
private fun NoticesCard(
    notices: List<MyDayNotice>,
    onAsk: (String?) -> Unit,
) {
    val colors = MichaelTheme.colors
    AICard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.md)) {
            Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm), verticalAlignment = Alignment.CenterVertically) {
                MichaelOrb(MichaelOrbSize.Small)
                MichaelText(
                    stringResource(R.string.myday_notices_title),
                    MichaelTextStyle.Heading,
                    colors.text,
                    Modifier.semantics { heading() },
                )
            }
            notices.forEach { notice ->
                Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
                    MichaelChip(notice.tag, tone = if (notice.tone == MyDayNotice.Tone.Warn) MichaelChipTone.Warn else MichaelChipTone.Ai)
                    MichaelText(notice.text, MichaelTextStyle.Body, colors.text)
                    notice.prompt?.let { prompt ->
                        MichaelButton(
                            notice.actionLabel,
                            { onAsk(prompt) },
                            style = MichaelButtonStyle.Secondary,
                            size = MichaelButtonSize.Small,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ProgressCard(
    summary: DailyTaskSummary,
    isToday: Boolean,
    next: TimelineItem?,
    timeZone: String,
    format: MyDayFormat,
) {
    val colors = MichaelTheme.colors
    val label = stringResource(if (isToday) R.string.myday_progress_today else R.string.myday_progress_other_day)
    val done = pluralStringResource(R.plurals.myday_progress_done, summary.total, summary.completed, summary.total)
    MichaelCard(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}) {
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.md)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                MichaelText(label, MichaelTextStyle.Label, colors.muted, Modifier.weight(1f))
                MichaelText(done, MichaelTextStyle.Label, colors.text)
            }
            MichaelProgressBar(summary.completionPercent / PERCENT)
            if (summary.unclassified > 0) {
                MichaelText(
                    pluralStringResource(R.plurals.myday_progress_unclassified, summary.unclassified, summary.unclassified),
                    MichaelTextStyle.Caption,
                    colors.faint,
                )
            }
            next?.let { item ->
                Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm), verticalAlignment = Alignment.CenterVertically) {
                    Image(MichaelIcons.clock, contentDescription = null, colorFilter = ColorFilter.tint(colors.muted))
                    MichaelText(
                        stringResource(R.string.myday_progress_next, item.label, format.timeRange(item.startAt, item.endAt, timeZone)),
                        MichaelTextStyle.Label,
                        colors.muted,
                    )
                }
            }
        }
    }
}

private const val PERCENT = 100f
