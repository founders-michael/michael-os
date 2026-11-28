package com.michaelos.feature.habits

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.michaelos.core.designsystem.component.ErrorBanner
import com.michaelos.core.designsystem.component.MichaelFieldButton
import com.michaelos.core.designsystem.component.MichaelSegmentedControl
import com.michaelos.core.designsystem.component.MichaelTextField
import com.michaelos.core.designsystem.component.MichaelTimePickerDialog
import com.michaelos.core.designsystem.component.MichaelWeekdayPicker
import com.michaelos.core.designsystem.component.michaelFieldFrame
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.Habit
import com.michaelos.core.model.HabitFrequency
import java.time.LocalTime

/** Create or edit a habit. Closing with unsaved changes asks first; the sheet closes once the server has the habit. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HabitEditorSheet(
    requestId: String,
    habit: Habit?,
    onSaved: (Habit) -> Unit,
    onClose: () -> Unit,
    viewModel: HabitEditorViewModel = hiltViewModel(key = "habit-editor-${habit?.id ?: "new"}"),
) {
    LaunchedEffect(requestId) { viewModel.start(requestId, habit) }
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var confirmingDiscard by rememberSaveable { mutableStateOf(false) }
    val current = state ?: return
    val haptics = LocalHapticFeedback.current
    val sheet =
        rememberModalBottomSheetState(skipPartiallyExpanded = true, confirmValueChange = { value ->
            val closing = value == SheetValue.Hidden
            if (closing && viewModel.uiState.value?.hasChanges == true) confirmingDiscard = true
            !closing || viewModel.uiState.value?.hasChanges != true
        })
    val saved = current.saved
    LaunchedEffect(saved) {
        if (saved != null) {
            haptics.performHapticFeedback(HapticFeedbackType.Confirm)
            onSaved(saved)
            onClose()
        }
    }
    val close = { if (current.hasChanges) confirmingDiscard = true else onClose() }
    ModalBottomSheet(onDismissRequest = onClose, sheetState = sheet, containerColor = MichaelTheme.colors.bg) {
        Column(Modifier.fillMaxWidth().imePadding()) {
            EditorBar(current, onCancel = close, onSave = viewModel::save)
            Column(
                Modifier.verticalScroll(rememberScrollState()).padding(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.md),
                verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg),
            ) {
                current.failure?.let { ErrorBanner(it.loadMessage()) }
                val nameProblem =
                    if (current.showsProblems &&
                        current.form.titleMissing
                    ) {
                        stringResource(R.string.habits_editor_problem_name)
                    } else {
                        null
                    }
                MichaelTextField(
                    label = stringResource(R.string.habits_editor_name),
                    value = current.form.title,
                    onValueChange = { value -> viewModel.edit { it.copy(title = value) } },
                    error = current.serverErrors["title"] ?: nameProblem,
                )
                Notes(current.form.notes) { value -> viewModel.edit { it.copy(notes = value) } }
                Schedule(current, viewModel)
                Times(current, viewModel)
            }
        }
    }
    if (confirmingDiscard) {
        AlertDialog(
            onDismissRequest = { confirmingDiscard = false },
            title = { Text(stringResource(R.string.habits_editor_discard)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDiscard = false
                    onClose()
                }) { Text(stringResource(R.string.habits_editor_discard_confirm), color = MichaelTheme.colors.danger) }
            },
            dismissButton = {
                TextButton(onClick = { confirmingDiscard = false }) { Text(stringResource(R.string.habits_editor_discard_keep)) }
            },
        )
    }
}

@Composable
private fun EditorBar(
    state: HabitEditorUiState,
    onCancel: () -> Unit,
    onSave: () -> Unit,
) {
    val colors = MichaelTheme.colors
    Row(Modifier.fillMaxWidth().padding(horizontal = MichaelSpace.sm), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = onCancel, enabled = !state.saving) { Text(stringResource(R.string.habits_editor_cancel), color = colors.text) }
        MichaelText(
            stringResource(if (state.habit == null) R.string.habits_editor_new else R.string.habits_editor_edit),
            MichaelTextStyle.Label,
            colors.text,
            modifier = Modifier.weight(1f),
        )
        if (state.saving) {
            val label = stringResource(R.string.habits_editor_saving)
            CircularProgressIndicator(
                Modifier.padding(MichaelSpace.md).size(MichaelSize.check).semantics { contentDescription = label },
                color = colors.accent,
            )
        } else {
            TextButton(onClick = onSave) { Text(stringResource(R.string.habits_editor_save), color = colors.atext) }
        }
    }
}

@Composable
private fun Notes(
    value: String,
    onChange: (String) -> Unit,
) {
    val colors = MichaelTheme.colors
    val label = stringResource(R.string.habits_editor_notes)
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
        MichaelText(label, MichaelTextStyle.Label, colors.muted)
        BasicTextField(
            value = value,
            onValueChange = onChange,
            minLines = 2,
            maxLines = 6,
            textStyle = MichaelTextStyle.Body.textStyle.copy(color = colors.text),
            cursorBrush = SolidColor(colors.accent),
            modifier = Modifier.michaelFieldFrame().semantics { contentDescription = label },
        )
    }
}

@Composable
private fun Schedule(
    state: HabitEditorUiState,
    viewModel: HabitEditorViewModel,
) {
    val colors = MichaelTheme.colors
    val schedule = state.form.schedule
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        MichaelText(stringResource(R.string.habits_editor_often), MichaelTextStyle.Label, colors.muted)
        MichaelSegmentedControl(
            options = listOf(HabitFrequency.Daily, HabitFrequency.SelectedDays),
            selected = schedule.frequency,
            onSelect = { value -> viewModel.edit { it.copy(schedule = it.schedule.copy(frequency = value)) } },
            title = { stringResource(if (it == HabitFrequency.Daily) R.string.habits_editor_daily else R.string.habits_editor_days) },
        )
        if (schedule.frequency == HabitFrequency.SelectedDays) {
            MichaelWeekdayPicker(schedule.weekdays, { days -> viewModel.edit { it.copy(schedule = it.schedule.copy(weekdays = days)) } })
        }
        val problem = problemText(state, HabitSchedule.Problem.NoWeekday) ?: state.serverErrors["weekdays"]
        if (problem != null) MichaelText(problem, MichaelTextStyle.Caption, colors.danger)
    }
}

@Composable
private fun Times(
    state: HabitEditorUiState,
    viewModel: HabitEditorViewModel,
) {
    val colors = MichaelTheme.colors
    val schedule = state.form.schedule
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        TimeField(stringResource(R.string.habits_editor_start), schedule.startTime) { value ->
            viewModel.edit { it.copy(schedule = it.schedule.copy(startTime = value)) }
        }
        TimeField(stringResource(R.string.habits_editor_end), schedule.endTime) { value ->
            viewModel.edit { it.copy(schedule = it.schedule.copy(endTime = value)) }
        }
        val problem =
            problemText(state, HabitSchedule.Problem.EndWithoutStart)
                ?: problemText(state, HabitSchedule.Problem.EndEqualsStart)
                ?: state.serverErrors["endTime"]
                ?: state.serverErrors["startTime"]
        when {
            problem != null -> {
                MichaelText(problem, MichaelTextStyle.Caption, colors.danger)
            }

            schedule.runsPastMidnight -> {
                MichaelText(
                    stringResource(R.string.habits_editor_past_midnight),
                    MichaelTextStyle.Caption,
                    colors.muted,
                )
            }

            else -> {
                MichaelText(stringResource(R.string.habits_editor_times_hint), MichaelTextStyle.Caption, colors.faint)
            }
        }
    }
}

@Composable
private fun TimeField(
    label: String,
    value: LocalTime?,
    onChange: (LocalTime?) -> Unit,
) {
    var picking by rememberSaveable { mutableStateOf(false) }
    MichaelText(label, MichaelTextStyle.Label, MichaelTheme.colors.muted)
    MichaelFieldButton(
        text = value?.let { timeText(it) } ?: stringResource(R.string.habits_editor_add),
        label = label,
        onClick = { picking = true },
        clearLabel = value?.let { stringResource(R.string.habits_editor_clear, label) },
        onClear = value?.let { { onChange(null) } },
    )
    if (picking) {
        MichaelTimePickerDialog(
            initial = value ?: DEFAULT_TIME,
            title = label,
            onPick = {
                picking = false
                onChange(it)
            },
            onDismiss = { picking = false },
        )
    }
}

@Composable
private fun problemText(
    state: HabitEditorUiState,
    problem: HabitSchedule.Problem,
): String? {
    if (!state.showsProblems || state.form.schedule.problem != problem) return null
    return stringResource(
        when (problem) {
            HabitSchedule.Problem.NoWeekday -> R.string.habits_editor_problem_days
            HabitSchedule.Problem.EndWithoutStart -> R.string.habits_editor_problem_end_without_start
            HabitSchedule.Problem.EndEqualsStart -> R.string.habits_editor_problem_end_equals_start
        },
    )
}

private val DEFAULT_TIME: LocalTime = LocalTime.of(7, 0)
