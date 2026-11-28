package com.michaelos.feature.habits

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.michaelos.core.designsystem.component.ErrorBanner
import com.michaelos.core.designsystem.component.FailureStateView
import com.michaelos.core.designsystem.component.MichaelBackButton
import com.michaelos.core.designsystem.component.MichaelBackground
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelChip
import com.michaelos.core.designsystem.component.MichaelChipTone
import com.michaelos.core.designsystem.component.StatTile
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.Habit
import com.michaelos.core.model.HabitStatus
import com.michaelos.core.model.isDoneOn
import com.michaelos.core.model.isMissedOn
import java.time.LocalDate
import java.util.UUID

/** One habit: today's check-in, the server's stats, the last 30 days, archive and delete. */
@Composable
fun HabitDetailScreen(
    key: HabitDetailKey,
    onBack: () -> Unit,
    viewModel: HabitDetailViewModel =
        hiltViewModel<HabitDetailViewModel, HabitDetailViewModel.Factory>(key = "habit-${key.id}") { it.create(key.id) },
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var editorId by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(state) { if (state == HabitDetailUiState.Gone) onBack() }
    val detail = (state as? HabitDetailUiState.Content)?.detail
    MichaelBackground(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = MichaelSpace.sm), verticalAlignment = Alignment.CenterVertically) {
                MichaelBackButton(onBack)
                MichaelText(
                    stringResource(R.string.habits_detail_title),
                    MichaelTextStyle.Label,
                    MichaelTheme.colors.text,
                    modifier = Modifier.weight(1f),
                )
                if (detail != null) {
                    TextButton(onClick = { editorId = UUID.randomUUID().toString() }, enabled = detail.busy == null) {
                        Text(stringResource(R.string.habits_detail_edit), color = MichaelTheme.colors.atext)
                    }
                }
            }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when (val current = state) {
                    HabitDetailUiState.Loading, HabitDetailUiState.Gone -> {
                        CircularProgressIndicator(Modifier.align(Alignment.Center), color = MichaelTheme.colors.accent)
                    }

                    is HabitDetailUiState.Failed -> {
                        FailureStateView(current.error.loadMessage(), viewModel::load, Modifier.align(Alignment.Center))
                    }

                    is HabitDetailUiState.Content -> {
                        Details(current.detail, viewModel)
                    }
                }
            }
        }
    }
    val requestId = editorId
    if (requestId != null && detail != null) {
        HabitEditorSheet(requestId, habit = detail.habit, onSaved = viewModel::saved, onClose = { editorId = null })
    }
}

@Composable
private fun Details(
    detail: HabitDetail,
    viewModel: HabitDetailViewModel,
) {
    val colors = MichaelTheme.colors
    val habit = detail.habit
    var confirmingDelete by rememberSaveable { mutableStateOf(false) }
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.md),
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            MichaelChip(scheduleText(habit), tone = if (habit.status == HabitStatus.Archived) MichaelChipTone.Plain else MichaelChipTone.Ai)
            MichaelText(habit.title, MichaelTextStyle.Display, colors.text, Modifier.semantics { heading() })
            habit.description?.let { MichaelText(it, MichaelTextStyle.Body, colors.muted) }
        }
        if (habit.dueToday) {
            MichaelButton(
                stringResource(if (habit.completedToday) R.string.habits_detail_undo else R.string.habits_detail_check_in),
                onClick = viewModel::toggleToday,
                modifier = Modifier.fillMaxWidth(),
                style = if (habit.completedToday) MichaelButtonStyle.Secondary else MichaelButtonStyle.Primary,
                enabled = detail.busy == null,
            )
        }
        detail.problem?.let { ErrorBanner(it.loadMessage()) }
        Stats(habit)
        Month(habit)
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            val archived = habit.status == HabitStatus.Archived
            MichaelButton(
                stringResource(if (archived) R.string.habits_detail_reactivate else R.string.habits_detail_archive),
                onClick = { viewModel.setArchived(!archived) },
                modifier = Modifier.fillMaxWidth(),
                style = MichaelButtonStyle.Secondary,
                enabled = detail.busy == null,
            )
            MichaelButton(
                stringResource(R.string.habits_detail_delete),
                onClick = { confirmingDelete = true },
                modifier = Modifier.fillMaxWidth(),
                style = MichaelButtonStyle.Destructive,
                enabled = detail.busy == null,
            )
        }
    }
    if (confirmingDelete) {
        AlertDialog(
            onDismissRequest = { confirmingDelete = false },
            title = { Text(stringResource(R.string.habits_delete_title)) },
            text = { Text(stringResource(R.string.habits_delete_message)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDelete = false
                    viewModel.delete()
                }) { Text(stringResource(R.string.habits_delete_confirm), color = colors.danger) }
            },
            dismissButton = {
                TextButton(onClick = { confirmingDelete = false }) { Text(stringResource(R.string.habits_delete_keep)) }
            },
        )
    }
}

@Composable
private fun Stats(habit: Habit) {
    val tiles: @Composable (Modifier) -> Unit = { modifier ->
        StatTile(habit.currentStreak.toString(), stringResource(R.string.habits_detail_current), modifier, highlighted = true)
        StatTile(habit.bestStreak.toString(), stringResource(R.string.habits_detail_best), modifier)
        StatTile(
            stringResource(R.string.habits_detail_percent, habit.completionPercentage),
            stringResource(R.string.habits_detail_completed),
            modifier,
        )
    }
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        if (LocalDensity.current.fontScale < LARGE_FONT_SCALE) {
            Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) { tiles(Modifier.weight(1f)) }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) { tiles(Modifier.fillMaxWidth()) }
        }
        MichaelText(
            pluralStringResource(
                R.plurals.habits_detail_history,
                habit.eligibleDays,
                habit.completedDays,
                habit.eligibleDays,
                dayText(habit.periodStart),
                dayText(habit.periodEnd),
            ),
            MichaelTextStyle.Caption,
            MichaelTheme.colors.muted,
        )
    }
}

/** The last 30 days: done, missed (scheduled and not done), not scheduled, and today outlined. */
@Composable
private fun Month(habit: Habit) {
    val colors = MichaelTheme.colors
    val days = (0 until MONTH_DAYS).map { habit.today.minusDays((MONTH_DAYS - 1 - it).toLong()) }
    val shape = RoundedCornerShape(MichaelRadius.buttonSmall / 2)
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        MichaelText(stringResource(R.string.habits_detail_month), MichaelTextStyle.Label, colors.muted)
        days.chunked(GRID_COLUMNS).forEach { week ->
            Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
                week.forEach { day ->
                    val label = dayLabel(habit, day)
                    Box(
                        Modifier
                            .weight(1f)
                            .aspectRatio(1f)
                            .background(fill(habit, day), shape)
                            .then(if (day == habit.today) Modifier.border((MichaelSpace.xs / 2), colors.accent, shape) else Modifier)
                            .semantics { contentDescription = label },
                    )
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.md)) {
            Legend(colors.accent, stringResource(R.string.habits_detail_done))
            Legend(colors.track, stringResource(R.string.habits_detail_missed))
            Legend(colors.raise, stringResource(R.string.habits_detail_off))
        }
    }
}

@Composable
private fun fill(
    habit: Habit,
    day: LocalDate,
): Color {
    val colors = MichaelTheme.colors
    return when {
        habit.isDoneOn(day) -> colors.accent
        habit.isMissedOn(day) -> colors.track
        else -> colors.raise
    }
}

@Composable
private fun dayLabel(
    habit: Habit,
    day: LocalDate,
): String {
    val date = dayText(day)
    return when {
        habit.isDoneOn(day) -> stringResource(R.string.habits_day_done, date)
        habit.isMissedOn(day) -> stringResource(R.string.habits_day_missed, date)
        else -> date
    }
}

@Composable
private fun Legend(
    color: Color,
    text: String,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
        Box(Modifier.size(MichaelSpace.md).background(color, RoundedCornerShape((MichaelSpace.xs / 2))))
        MichaelText(text, MichaelTextStyle.Caption, MichaelTheme.colors.muted)
    }
}

private const val MONTH_DAYS = 30
private const val GRID_COLUMNS = 10
private const val LARGE_FONT_SCALE = 1.5f
