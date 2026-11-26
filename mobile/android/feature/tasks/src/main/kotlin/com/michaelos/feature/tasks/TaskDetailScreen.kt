package com.michaelos.feature.tasks

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.michaelos.core.designsystem.component.EmptyStateView
import com.michaelos.core.designsystem.component.ErrorBanner
import com.michaelos.core.designsystem.component.FailureStateView
import com.michaelos.core.designsystem.component.MichaelBackButton
import com.michaelos.core.designsystem.component.MichaelBackground
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelCard
import com.michaelos.core.designsystem.component.MichaelChip
import com.michaelos.core.designsystem.component.MichaelChipTone
import com.michaelos.core.designsystem.component.MichaelFieldButton
import com.michaelos.core.designsystem.component.MichaelIcons
import com.michaelos.core.designsystem.component.MichaelSegmentedControl
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.Task
import com.michaelos.core.model.TaskPriority
import com.michaelos.core.model.TaskStatus
import java.time.LocalDate
import java.util.UUID

@Composable
fun TaskDetailScreen(
    key: TaskDetailKey,
    onBack: () -> Unit,
    viewModel: TaskDetailViewModel =
        hiltViewModel<TaskDetailViewModel, TaskDetailViewModel.Factory>(key = key.id) { it.create(key.id) },
    insights: TaskInsightsViewModel =
        hiltViewModel<TaskInsightsViewModel, TaskInsightsViewModel.Factory>(key = "insights-${key.id}") { it.create(key.id) },
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val today = key.today?.let(LocalDate::parse)
    var editorId by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(state) { if (state == TaskDetailUiState.Deleted) onBack() }
    MichaelBackground(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = MichaelSpace.sm), verticalAlignment = Alignment.CenterVertically) {
                MichaelBackButton(onBack)
                MichaelText(
                    stringResource(R.string.tasks_detail_title),
                    MichaelTextStyle.Label,
                    MichaelTheme.colors.text,
                    modifier = Modifier.weight(1f),
                )
                val detail = (state as? TaskDetailUiState.Content)?.detail
                if (detail != null) {
                    TextButton(onClick = { editorId = UUID.randomUUID().toString() }, enabled = detail.busy == null) {
                        Text(stringResource(R.string.tasks_detail_edit), color = MichaelTheme.colors.atext)
                    }
                }
            }
            Box(Modifier.weight(1f)) {
                when (val current = state) {
                    TaskDetailUiState.Loading -> {
                        CircularProgressIndicator(Modifier.align(Alignment.Center), color = MichaelTheme.colors.accent)
                    }

                    is TaskDetailUiState.Failed -> {
                        FailureStateView(current.error.loadMessage(), viewModel::load, Modifier.align(Alignment.Center))
                    }

                    TaskDetailUiState.NotFound, TaskDetailUiState.Deleted -> {
                        EmptyStateView(
                            title = stringResource(R.string.tasks_detail_gone_title),
                            message = stringResource(R.string.tasks_detail_gone_message),
                            actionText = stringResource(R.string.tasks_detail_gone_action),
                            onAction = onBack,
                            modifier = Modifier.align(Alignment.Center),
                        )
                    }

                    is TaskDetailUiState.Content -> {
                        Details(current.detail, today, key.timeZone, viewModel, insights)
                    }
                }
            }
        }
    }
    val detail = (state as? TaskDetailUiState.Content)?.detail
    val requestId = editorId
    if (requestId != null && detail != null) {
        TaskEditorSheet(
            request = EditorRequest(requestId, detail.task.id),
            task = detail.task,
            timeZone = key.timeZone,
            today = today,
            onSaved = viewModel::saved,
            onClose = { editorId = null },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Details(
    detail: TaskDetail,
    today: LocalDate?,
    timeZone: String,
    viewModel: TaskDetailViewModel,
    insights: TaskInsightsViewModel,
) {
    val colors = MichaelTheme.colors
    val task = detail.task
    val extras by insights.uiState.collectAsStateWithLifecycle()
    var confirmingDelete by rememberSaveable { mutableStateOf(false) }
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(
                rememberScrollState(),
            ).padding(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.md),
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg),
    ) {
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
            verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs),
        ) {
            MichaelChip(dueText(task, today), tone = if (TaskFormat.isOverdue(task, today)) MichaelChipTone.Warn else MichaelChipTone.Plain)
            MichaelChip(
                priorityText(task.priority),
                tone =
                    if (task.priority ==
                        TaskPriority.High
                    ) {
                        MichaelChipTone.Warn
                    } else {
                        MichaelChipTone.Plain
                    },
            )
        }
        MichaelText(task.title, MichaelTextStyle.Display, colors.text, modifier = Modifier.semantics { heading() })
        task.description?.let { MichaelText(it, MichaelTextStyle.Body, colors.muted) }
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
            MichaelText(stringResource(R.string.tasks_detail_status), MichaelTextStyle.Label, colors.muted)
            ChoiceControl(
                options = listOf(TaskStatus.Todo, TaskStatus.InProgress, TaskStatus.Completed),
                selected = detail.status,
                label = stringResource(R.string.tasks_detail_status),
                enabled = detail.busy == null,
                onSelect = viewModel::setStatus,
                title = { statusText(it) },
            )
        }
        detail.problem?.let { ErrorBanner(problemMessage(it)) }
        Fields(task, timeZone)
        TaskGoalsSection(extras, insights::toggle)
        TaskCategoriesSection(extras, insights)
        extras.problem?.let { ErrorBanner(it.refusal ?: it.loadMessage()) }
        if (task.activeRecurrence != null && detail.status != TaskStatus.Completed) {
            Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
                MichaelButton(
                    stringResource(R.string.tasks_detail_skip),
                    viewModel::skip,
                    modifier = Modifier.fillMaxWidth(),
                    style = MichaelButtonStyle.Secondary,
                    enabled =
                        detail.busy == null,
                )
                MichaelText(stringResource(R.string.tasks_detail_skip_hint), MichaelTextStyle.Caption, colors.muted)
            }
        }
        MichaelButton(
            stringResource(R.string.tasks_detail_delete),
            { confirmingDelete = true },
            modifier = Modifier.fillMaxWidth(),
            style = MichaelButtonStyle.Destructive,
            enabled = detail.busy == null,
        )
    }
    if (confirmingDelete) {
        AlertDialog(
            onDismissRequest = { confirmingDelete = false },
            title = { Text(stringResource(R.string.tasks_delete_title)) },
            text = {
                Text(
                    stringResource(
                        if (task.activeRecurrence ==
                            null
                        ) {
                            R.string.tasks_delete_message
                        } else {
                            R.string.tasks_delete_message_repeating
                        },
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDelete = false
                    viewModel.delete()
                }) { Text(stringResource(R.string.tasks_delete_confirm), color = colors.danger) }
            },
            dismissButton = { TextButton(onClick = { confirmingDelete = false }) { Text(stringResource(R.string.tasks_editor_cancel)) } },
        )
    }
}

@Composable
private fun Fields(
    task: Task,
    timeZone: String,
) {
    val notSet = stringResource(R.string.tasks_detail_not_set)
    MichaelCard {
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.md)) {
            Field(
                stringResource(R.string.tasks_detail_due),
                task.dueDate?.let(TaskFormat::longDate) ?: stringResource(R.string.tasks_due_none),
            )
            Field(stringResource(R.string.tasks_detail_estimate), task.estimatedDurationMinutes?.let { minutesText(it) } ?: notSet)
            Field(stringResource(R.string.tasks_detail_remaining), task.remainingDurationMinutes?.let { minutesText(it) } ?: notSet)
            task.activeRecurrence?.let { Field(stringResource(R.string.tasks_detail_repeats), it.label) }
            val pending = task.pendingReminder
            when {
                pending != null -> {
                    Field(stringResource(R.string.tasks_detail_reminder), reminderText(pending, zoneOf(timeZone)))
                }

                task.remindAt != null && task.reminderSent -> {
                    Field(
                        stringResource(R.string.tasks_detail_reminder),
                        stringResource(R.string.tasks_detail_reminder_sent),
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Field(
    label: String,
    value: String,
) {
    val colors = MichaelTheme.colors
    FlowRow(
        Modifier.fillMaxWidth().semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs),
    ) {
        MichaelText(label, MichaelTextStyle.Body, colors.muted)
        MichaelText(value, MichaelTextStyle.Body, colors.text)
    }
}

@Composable
private fun problemMessage(problem: TaskDetail.Problem): String {
    val fallback =
        stringResource(
            when (problem.action) {
                TaskDetail.Action.Status -> R.string.tasks_detail_problem_status
                TaskDetail.Action.Skip -> R.string.tasks_detail_problem_skip
                TaskDetail.Action.Delete -> R.string.tasks_detail_problem_delete
            },
        )
    val reason = problem.error.refusal ?: return fallback
    return stringResource(R.string.tasks_rollback_reason, fallback, reason)
}
