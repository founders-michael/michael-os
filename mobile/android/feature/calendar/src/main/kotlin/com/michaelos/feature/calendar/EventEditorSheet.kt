package com.michaelos.feature.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.michaelos.core.designsystem.component.ErrorBanner
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelDatePickerDialog
import com.michaelos.core.designsystem.component.MichaelFieldButton
import com.michaelos.core.designsystem.component.MichaelIcons
import com.michaelos.core.designsystem.component.MichaelSegmentedControl
import com.michaelos.core.designsystem.component.MichaelTextField
import com.michaelos.core.designsystem.component.MichaelTimeRow
import com.michaelos.core.designsystem.component.michaelFieldFrame
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.UnscheduledTask

/** Create or edit an event. Closing with unsaved changes asks first; the sheet closes once the server has the change. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun EventEditorSheet(
    request: EditorRequest,
    clock: ZonedClock,
    tasks: List<UnscheduledTask>,
    onClose: () -> Unit,
    viewModel: EventEditorViewModel = hiltViewModel(key = "event-editor-${request.id}"),
) {
    LaunchedEffect(request.id) { viewModel.start(request.id, request.form, request.event, clock, tasks) }
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var confirmingDiscard by rememberSaveable { mutableStateOf(false) }
    var confirmingDelete by rememberSaveable { mutableStateOf(false) }
    val current = state ?: return
    val sheet =
        rememberModalBottomSheetState(skipPartiallyExpanded = true, confirmValueChange = { value ->
            val closing = value == SheetValue.Hidden
            val guarded = viewModel.uiState.value?.let { it.hasChanges || it.busy } == true
            if (closing && guarded) confirmingDiscard = true
            !closing || !guarded
        })
    LaunchedEffect(current.done) {
        if (current.done) onClose()
    }
    val close = { if (current.hasChanges) confirmingDiscard = true else onClose() }
    ModalBottomSheet(onDismissRequest = onClose, sheetState = sheet, containerColor = MichaelTheme.colors.bg) {
        Column(Modifier.fillMaxWidth().imePadding()) {
            EditorBar(current, onCancel = close, onSave = viewModel::save)
            Column(
                Modifier.verticalScroll(rememberScrollState()).padding(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.md),
                verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg),
            ) {
                EditorFields(current, viewModel) { confirmingDelete = true }
            }
        }
    }
    EditorDialogs(
        discarding = confirmingDiscard,
        deleting = confirmingDelete,
        session = current.form.kind == EventKind.Session,
        onDiscard = onClose,
        onDelete = viewModel::delete,
        onDismiss = {
            confirmingDiscard = false
            confirmingDelete = false
        },
    )
}

@Composable
private fun EditorFields(
    current: EventEditorUiState,
    viewModel: EventEditorViewModel,
    onDelete: () -> Unit,
) {
    if (current.conflicts.isNotEmpty()) ConflictBanner(current)
    current.failure?.let { ErrorBanner(it.message()) }
    val titleProblem =
        if (current.showsProblems && EventForm.Problem.TitleMissing in current.form.problems) {
            stringResource(R.string.calendar_editor_problem_title)
        } else {
            null
        }
    MichaelTextField(
        label = stringResource(R.string.calendar_editor_title),
        value = current.form.title,
        onValueChange = { value -> viewModel.edit { it.copy(title = value) } },
        error = current.serverErrors["title"] ?: titleProblem,
    )
    Kind(current) { kind -> viewModel.edit { it.copy(kind = kind) } }
    if (current.form.kind == EventKind.Session) TaskField(current, viewModel)
    When(current, viewModel)
    Notes(current.form.notes) { value -> viewModel.edit { it.copy(notes = value) } }
    if (current.event != null) {
        MichaelButton(
            stringResource(R.string.calendar_editor_delete),
            onDelete,
            Modifier.fillMaxWidth(),
            style = MichaelButtonStyle.Destructive,
        )
    }
}

@Composable
private fun EditorDialogs(
    discarding: Boolean,
    deleting: Boolean,
    session: Boolean,
    onDiscard: () -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit,
) {
    val keep = @Composable { TextButton(onClick = onDismiss) { Text(stringResource(R.string.calendar_editor_keep)) } }
    if (discarding) {
        AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text(stringResource(R.string.calendar_editor_discard)) },
            confirmButton = {
                TextButton(onClick = {
                    onDismiss()
                    onDiscard()
                }) { Text(stringResource(R.string.calendar_editor_discard_confirm), color = MichaelTheme.colors.danger) }
            },
            dismissButton = keep,
        )
    }
    if (deleting) {
        AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text(stringResource(R.string.calendar_editor_delete_title)) },
            text = {
                Text(stringResource(if (session) R.string.calendar_editor_delete_session else R.string.calendar_editor_delete_message))
            },
            confirmButton = {
                TextButton(onClick = {
                    onDismiss()
                    onDelete()
                }) { Text(stringResource(R.string.calendar_editor_delete_confirm), color = MichaelTheme.colors.danger) }
            },
            dismissButton = keep,
        )
    }
}

@Composable
private fun EditorBar(
    state: EventEditorUiState,
    onCancel: () -> Unit,
    onSave: () -> Unit,
) {
    val colors = MichaelTheme.colors
    Row(Modifier.fillMaxWidth().padding(horizontal = MichaelSpace.sm), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = onCancel, enabled = !state.busy) { Text(stringResource(R.string.calendar_editor_cancel), color = colors.text) }
        MichaelText(
            stringResource(if (state.event == null) R.string.calendar_editor_new else R.string.calendar_editor_edit),
            MichaelTextStyle.Label,
            colors.text,
            modifier = Modifier.weight(1f),
        )
        if (state.busy) {
            val label = stringResource(R.string.calendar_editor_saving)
            CircularProgressIndicator(
                Modifier.padding(MichaelSpace.md).size(MichaelSize.check).semantics { contentDescription = label },
                color = colors.accent,
            )
        } else {
            TextButton(onClick = onSave) { Text(stringResource(R.string.calendar_editor_save), color = colors.atext) }
        }
    }
}

@Composable
private fun ConflictBanner(state: EventEditorUiState) {
    val colors = MichaelTheme.colors
    Column(
        Modifier
            .fillMaxWidth()
            .background(colors.dangerBg, RoundedCornerShape(MichaelRadius.stat))
            .padding(MichaelSpace.md)
            .semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs),
    ) {
        MichaelText(stringResource(R.string.calendar_editor_conflict), MichaelTextStyle.Label, colors.danger)
        state.conflicts.forEach { conflict ->
            MichaelText(
                "${conflict.title}, ${CalendarFormat.range(conflict.startAt, conflict.endAt, state.clock)}",
                MichaelTextStyle.Caption,
                colors.danger,
            )
        }
        MichaelText(stringResource(R.string.calendar_editor_conflict_help), MichaelTextStyle.Caption, colors.danger)
    }
}

@Composable
private fun Kind(
    state: EventEditorUiState,
    onPick: (EventKind) -> Unit,
) {
    val colors = MichaelTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
        MichaelText(stringResource(R.string.calendar_editor_type), MichaelTextStyle.Label, colors.muted)
        if (state.event == null) {
            MichaelSegmentedControl(EventKind.entries, state.form.kind, onPick, title = { it.label() })
        } else {
            MichaelText(state.form.kind.label(), MichaelTextStyle.Body, colors.text)
        }
        MichaelText(state.form.kind.help(), MichaelTextStyle.Caption, colors.faint)
    }
}

@Composable
private fun TaskField(
    state: EventEditorUiState,
    viewModel: EventEditorViewModel,
) {
    var open by rememberSaveable { mutableStateOf(false) }
    val label = stringResource(R.string.calendar_editor_task)
    val none = stringResource(R.string.calendar_editor_task_none)
    val options =
        state.tasks.map { it.id to it.title }.let { listed ->
            val linked = state.form.taskId?.let { id -> state.form.taskTitle?.let { id to it } }
            if (linked != null && listed.none { it.first == linked.first }) listOf(linked) + listed else listed
        }
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
        MichaelText(label, MichaelTextStyle.Label, MichaelTheme.colors.muted)
        Box {
            MichaelFieldButton(
                text = state.form.taskTitle ?: none,
                label = label,
                onClick = { open = true },
                trailing = MichaelIcons.choose,
            )
            DropdownMenu(expanded = open, onDismissRequest = { open = false }, containerColor = MichaelTheme.colors.solid) {
                DropdownMenuItem(text = { Text(none) }, onClick = {
                    open = false
                    viewModel.edit { it.copy(taskId = null, taskTitle = null) }
                })
                options.forEach { (id, title) ->
                    DropdownMenuItem(text = { Text(title, maxLines = 1) }, onClick = {
                        open = false
                        viewModel.edit { form ->
                            form.copy(taskId = id, taskTitle = title, title = form.title.ifBlank { title.take(EventForm.TITLE_LIMIT) })
                        }
                    })
                }
            }
        }
    }
}

@Composable
private fun When(
    state: EventEditorUiState,
    viewModel: EventEditorViewModel,
) {
    val colors = MichaelTheme.colors
    var picking by rememberSaveable { mutableStateOf(false) }
    val done = stringResource(R.string.calendar_picker_done)
    val cancel = stringResource(R.string.calendar_picker_cancel)
    val dateLabel = stringResource(R.string.calendar_editor_date)
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        MichaelText(dateLabel, MichaelTextStyle.Label, colors.muted)
        MichaelFieldButton(text = CalendarFormat.fullDate(state.form.date), label = dateLabel, onClick = { picking = true })
        Column(Modifier.michaelFieldFrame()) {
            MichaelTimeRow(stringResource(R.string.calendar_editor_starts), state.form.start, done, cancel) { time ->
                viewModel.edit { it.withStart(time) }
            }
            MichaelTimeRow(stringResource(R.string.calendar_editor_ends), state.form.end, done, cancel) { time ->
                viewModel.edit { it.withEnd(time) }
            }
        }
        val problem =
            when {
                state.showsProblems && EventForm.Problem.NoLength in state.form.problems -> {
                    stringResource(
                        R.string.calendar_editor_problem_length,
                    )
                }

                else -> {
                    state.serverErrors["endAt"] ?: state.serverErrors["startAt"]
                }
            }
        when {
            problem != null -> MichaelText(problem, MichaelTextStyle.Caption, colors.danger)
            state.form.endsNextDay -> MichaelText(stringResource(R.string.calendar_editor_next_day), MichaelTextStyle.Caption, colors.muted)
        }
        MichaelText(stringResource(R.string.calendar_editor_zone, state.clock.zone), MichaelTextStyle.Caption, colors.faint)
    }
    if (picking) {
        MichaelDatePickerDialog(
            initial = state.form.date,
            onPick = { date -> viewModel.edit { it.copy(date = date) } },
            onDismiss = { picking = false },
        )
    }
}

@Composable
private fun Notes(
    value: String,
    onChange: (String) -> Unit,
) {
    val colors = MichaelTheme.colors
    val label = stringResource(R.string.calendar_editor_notes)
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
