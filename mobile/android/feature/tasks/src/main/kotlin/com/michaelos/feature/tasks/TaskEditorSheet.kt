package com.michaelos.feature.tasks

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.michaelos.core.designsystem.component.ErrorBanner
import com.michaelos.core.designsystem.component.MichaelFieldTone
import com.michaelos.core.designsystem.component.MichaelSegmentedControl
import com.michaelos.core.designsystem.component.michaelFieldFrame
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.Task
import com.michaelos.core.model.TaskPriority
import java.time.LocalDate

/**
 * Create or edit a task. Closing with unsaved changes asks first; the sheet closes itself once the server has returned
 * the saved task.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun TaskEditorSheet(
    request: EditorRequest,
    task: Task?,
    timeZone: String,
    today: LocalDate?,
    onSaved: (Task) -> Unit,
    onClose: () -> Unit,
    viewModel: TaskEditorViewModel = hiltViewModel(key = "task-editor-${request.taskId ?: "new"}"),
) {
    LaunchedEffect(request.id) { viewModel.start(request.id, task, timeZone, today) }
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
    val saved = (current.status as? TaskEditorUiState.Status.Saved)?.task
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
                current.failure?.let { ErrorBanner(it.refusal ?: it.loadMessage()) }
                TextInput(
                    label = stringResource(R.string.tasks_editor_title),
                    value = current.form.title,
                    count = TaskForm.TITLE_LIMIT,
                    message = message(current, TaskForm.Field.Title),
                    lines = 1..3,
                ) { value -> viewModel.edit { it.copy(title = value) } }
                TextInput(
                    label = stringResource(R.string.tasks_editor_notes),
                    value = current.form.notes,
                    count = TaskForm.NOTES_LIMIT,
                    message = message(current, TaskForm.Field.Description),
                    lines = 3..8,
                ) { value -> viewModel.edit { it.copy(notes = value) } }
                Labelled(stringResource(R.string.tasks_editor_priority), null) {
                    MichaelSegmentedControl(
                        options = listOf(TaskPriority.Low, TaskPriority.Medium, TaskPriority.High),
                        selected = current.form.priority,
                        onSelect = { value -> viewModel.edit { it.copy(priority = value) } },
                        title = { priorityText(it) },
                    )
                }
                Labelled(stringResource(R.string.tasks_editor_due), message(current, TaskForm.Field.DueDate)) {
                    OptionalDateField(
                        label = stringResource(R.string.tasks_editor_due),
                        date = current.form.dueDate,
                        start = { current.today ?: LocalDate.now(zoneOf(current.timeZone)) },
                        addText = stringResource(R.string.tasks_editor_due_add),
                        clearLabel = stringResource(R.string.tasks_editor_due_clear),
                        tone = toneOf(message(current, TaskForm.Field.DueDate)),
                    ) { value -> viewModel.edit { it.copy(dueDate = value) } }
                }
                MinutesInput(
                    stringResource(R.string.tasks_editor_estimate),
                    current.form.estimate,
                    message(current, TaskForm.Field.Estimate),
                ) { value ->
                    viewModel.edit { it.copy(estimate = value) }
                }
                MinutesInput(
                    stringResource(R.string.tasks_editor_remaining),
                    current.form.remaining,
                    message(current, TaskForm.Field.Remaining),
                ) { value ->
                    viewModel.edit { it.copy(remaining = value) }
                }
                RepeatField(current, message(current, TaskForm.Field.Recurrence), viewModel::edit)
                ReminderField(current, message(current, TaskForm.Field.Reminder), viewModel::edit)
            }
        }
    }
    if (confirmingDiscard) {
        AlertDialog(
            onDismissRequest = { confirmingDiscard = false },
            title = { Text(stringResource(R.string.tasks_editor_discard_title)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDiscard = false
                    onClose()
                }) { Text(stringResource(R.string.tasks_editor_discard_confirm), color = MichaelTheme.colors.danger) }
            },
            dismissButton = {
                TextButton(
                    onClick = { confirmingDiscard = false },
                ) { Text(stringResource(R.string.tasks_editor_discard_keep)) }
            },
        )
    }
}

@Composable
private fun EditorBar(
    state: TaskEditorUiState,
    onCancel: () -> Unit,
    onSave: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val saving = state.status == TaskEditorUiState.Status.Saving
    Row(Modifier.fillMaxWidth().padding(horizontal = MichaelSpace.sm), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = onCancel, enabled = !saving) { Text(stringResource(R.string.tasks_editor_cancel), color = colors.text) }
        MichaelText(
            stringResource(if (state.isNew) R.string.tasks_editor_new else R.string.tasks_editor_edit),
            MichaelTextStyle.Label,
            colors.text,
            modifier = Modifier.weight(1f),
        )
        if (saving) {
            val label = stringResource(R.string.tasks_editor_saving)
            CircularProgressIndicator(
                Modifier.padding(MichaelSpace.md).size(MichaelSize.check).semantics {
                    contentDescription = label
                },
                color = colors.accent,
            )
        } else {
            TextButton(onClick = onSave) { Text(stringResource(R.string.tasks_editor_save), color = colors.atext) }
        }
    }
}

@Composable
private fun message(
    state: TaskEditorUiState,
    field: TaskForm.Field,
): String? = state.serverErrors[field] ?: state.problem(field)?.let { problemText(it) }

internal fun toneOf(message: String?): MichaelFieldTone = if (message == null) MichaelFieldTone.Plain else MichaelFieldTone.Error

/** A field's label, an optional character count, the control and the reason it was refused. */
@Composable
internal fun Labelled(
    label: String,
    message: String?,
    counter: String? = null,
    control: @Composable () -> Unit,
) {
    val colors = MichaelTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
        Row {
            MichaelText(label, MichaelTextStyle.Label, if (message == null) colors.muted else colors.danger, modifier = Modifier.weight(1f))
            counter?.let { MichaelText(it, MichaelTextStyle.Label, colors.faint) }
        }
        control()
        message?.let { MichaelText(it, MichaelTextStyle.Caption, colors.danger) }
    }
}

@Composable
private fun TextInput(
    label: String,
    value: String,
    count: Int,
    message: String?,
    lines: IntRange,
    onChange: (String) -> Unit,
) {
    val colors = MichaelTheme.colors
    val counter = if (value.isNotEmpty()) stringResource(R.string.tasks_editor_count, value.length, count) else null
    Labelled(label, message, counter) {
        BasicTextField(
            value = value,
            onValueChange = onChange,
            minLines = lines.first,
            maxLines = lines.last,
            textStyle = MichaelTextStyle.Body.textStyle.copy(color = colors.text),
            cursorBrush = SolidColor(colors.accent),
            modifier = Modifier.semantics { contentDescription = label }.michaelFieldFrame(toneOf(message)),
        )
    }
}

@Composable
private fun MinutesInput(
    label: String,
    value: String,
    message: String?,
    onChange: (String) -> Unit,
) {
    val colors = MichaelTheme.colors
    Labelled(label, message) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            Box(Modifier.weight(1f)) {
                BasicTextField(
                    value = value,
                    onValueChange = onChange,
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    textStyle = MichaelTextStyle.Body.textStyle.copy(color = colors.text),
                    cursorBrush = SolidColor(colors.accent),
                    modifier = Modifier.semantics { contentDescription = label }.michaelFieldFrame(toneOf(message)),
                )
            }
            MichaelText(stringResource(R.string.tasks_editor_minutes_unit), MichaelTextStyle.Label, colors.muted)
        }
    }
}
