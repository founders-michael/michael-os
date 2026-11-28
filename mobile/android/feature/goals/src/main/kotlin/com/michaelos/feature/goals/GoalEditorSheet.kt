package com.michaelos.feature.goals

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
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
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
import com.michaelos.core.designsystem.component.MichaelDatePickerDialog
import com.michaelos.core.designsystem.component.MichaelFieldButton
import com.michaelos.core.designsystem.component.MichaelTextField
import com.michaelos.core.designsystem.component.michaelFieldFrame
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.Goal
import java.time.LocalDate
import kotlin.math.roundToInt

/** Create or edit a goal. Closing with unsaved changes asks first; the sheet closes once the server has the goal. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun GoalEditorSheet(
    requestId: String,
    goal: Goal?,
    onSaved: (Goal) -> Unit,
    onClose: () -> Unit,
    viewModel: GoalEditorViewModel = hiltViewModel(key = "goal-editor-${goal?.id ?: "new"}"),
) {
    LaunchedEffect(requestId) { viewModel.start(requestId, goal) }
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
                val titleProblem =
                    if (current.showsProblems && current.form.titleMissing) stringResource(R.string.goals_editor_problem_title) else null
                MichaelTextField(
                    label = stringResource(R.string.goals_editor_title),
                    value = current.form.title,
                    onValueChange = { value -> viewModel.edit { it.copy(title = value) } },
                    error = current.serverErrors["title"] ?: titleProblem,
                )
                Notes(current.form.notes) { value -> viewModel.edit { it.copy(notes = value) } }
                MichaelTextField(
                    label = stringResource(R.string.goals_editor_category),
                    value = current.form.category,
                    onValueChange = { value -> viewModel.edit { it.copy(category = value) } },
                    error = current.serverErrors["category"],
                )
                Target(current) { value -> viewModel.edit { it.copy(targetDate = value) } }
                if (current.form.editsProgress) {
                    ProgressField(current.form.progress) { value -> viewModel.edit { it.copy(progress = value) } }
                }
            }
        }
    }
    if (confirmingDiscard) {
        AlertDialog(
            onDismissRequest = { confirmingDiscard = false },
            title = { Text(stringResource(R.string.goals_editor_discard)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDiscard = false
                    onClose()
                }) { Text(stringResource(R.string.goals_editor_discard_confirm), color = MichaelTheme.colors.danger) }
            },
            dismissButton = {
                TextButton(onClick = { confirmingDiscard = false }) { Text(stringResource(R.string.goals_editor_discard_keep)) }
            },
        )
    }
}

@Composable
private fun EditorBar(
    state: GoalEditorUiState,
    onCancel: () -> Unit,
    onSave: () -> Unit,
) {
    val colors = MichaelTheme.colors
    Row(Modifier.fillMaxWidth().padding(horizontal = MichaelSpace.sm), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = onCancel, enabled = !state.saving) { Text(stringResource(R.string.goals_editor_cancel), color = colors.text) }
        MichaelText(
            stringResource(if (state.goal == null) R.string.goals_editor_new else R.string.goals_editor_edit),
            MichaelTextStyle.Label,
            colors.text,
            modifier = Modifier.weight(1f),
        )
        if (state.saving) {
            val label = stringResource(R.string.goals_editor_saving)
            CircularProgressIndicator(
                Modifier.padding(MichaelSpace.md).size(MichaelSize.check).semantics { contentDescription = label },
                color = colors.accent,
            )
        } else {
            TextButton(onClick = onSave) { Text(stringResource(R.string.goals_editor_save), color = colors.atext) }
        }
    }
}

@Composable
private fun Notes(
    value: String,
    onChange: (String) -> Unit,
) {
    val colors = MichaelTheme.colors
    val label = stringResource(R.string.goals_editor_notes)
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
private fun Target(
    state: GoalEditorUiState,
    onChange: (LocalDate?) -> Unit,
) {
    var picking by rememberSaveable { mutableStateOf(false) }
    val label = stringResource(R.string.goals_editor_target)
    val value = state.form.targetDate
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
        MichaelText(label, MichaelTextStyle.Label, MichaelTheme.colors.muted)
        MichaelFieldButton(
            text = value?.let { dateText(it) } ?: stringResource(R.string.goals_editor_add_target),
            label = label,
            onClick = { picking = true },
            clearLabel = value?.let { stringResource(R.string.goals_editor_clear_target) },
            onClear = value?.let { { onChange(null) } },
        )
        state.serverErrors["targetDate"]?.let { MichaelText(it, MichaelTextStyle.Caption, MichaelTheme.colors.danger) }
    }
    if (picking) {
        MichaelDatePickerDialog(
            initial = value ?: LocalDate.now(),
            onPick = onChange,
            onDismiss = { picking = false },
        )
    }
}

@Composable
private fun ProgressField(
    value: Int,
    onChange: (Int) -> Unit,
) {
    val colors = MichaelTheme.colors
    val label = stringResource(R.string.goals_detail_progress)
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            MichaelText(label, MichaelTextStyle.Label, colors.muted, Modifier.weight(1f))
            MichaelText(stringResource(R.string.goals_percent, value), MichaelTextStyle.Label, colors.atext)
        }
        Slider(
            value = value.toFloat(),
            onValueChange = { onChange(it.roundToInt()) },
            valueRange = 0f..PERCENT.toFloat(),
            steps = PROGRESS_STEPS,
            colors = SliderDefaults.colors(thumbColor = colors.accent, activeTrackColor = colors.accent, inactiveTrackColor = colors.track),
            modifier = Modifier.semantics { contentDescription = label },
        )
        MichaelText(stringResource(R.string.goals_detail_progress_hint), MichaelTextStyle.Caption, colors.faint)
    }
}

/** 0 to 100 in fives: 19 stops between the ends. */
private const val PROGRESS_STEPS = 19
