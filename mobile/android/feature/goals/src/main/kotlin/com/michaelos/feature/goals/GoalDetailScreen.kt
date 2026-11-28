package com.michaelos.feature.goals

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
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
import com.michaelos.core.designsystem.component.MichaelCheck
import com.michaelos.core.designsystem.component.MichaelChip
import com.michaelos.core.designsystem.component.MichaelChipTone
import com.michaelos.core.designsystem.component.MichaelIcons
import com.michaelos.core.designsystem.component.MichaelOrb
import com.michaelos.core.designsystem.component.MichaelOrbSize
import com.michaelos.core.designsystem.component.MichaelProgressBar
import com.michaelos.core.designsystem.component.michaelFieldFrame
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.Goal
import com.michaelos.core.model.GoalMilestone
import com.michaelos.core.model.GoalStatus
import java.util.UUID
import kotlin.math.roundToInt

/** One goal: manual progress, Michael's read, milestones, and the status actions. */
@Composable
fun GoalDetailScreen(
    key: GoalDetailKey,
    ask: (String) -> Unit,
    onBack: () -> Unit,
    viewModel: GoalDetailViewModel =
        hiltViewModel<GoalDetailViewModel, GoalDetailViewModel.Factory>(key = "goal-${key.id}") { it.create(key.id) },
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var editorId by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(state) { if (state == GoalDetailUiState.Gone) onBack() }
    val detail = (state as? GoalDetailUiState.Content)?.detail
    MichaelBackground(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = MichaelSpace.sm), verticalAlignment = Alignment.CenterVertically) {
                MichaelBackButton(onBack)
                MichaelText(
                    stringResource(R.string.goals_detail_title),
                    MichaelTextStyle.Label,
                    MichaelTheme.colors.text,
                    modifier = Modifier.weight(1f),
                )
                if (detail != null) {
                    TextButton(onClick = { editorId = UUID.randomUUID().toString() }, enabled = detail.busy == null) {
                        Text(stringResource(R.string.goals_detail_edit), color = MichaelTheme.colors.atext)
                    }
                }
            }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when (val current = state) {
                    GoalDetailUiState.Loading, GoalDetailUiState.Gone -> {
                        CircularProgressIndicator(Modifier.align(Alignment.Center), color = MichaelTheme.colors.accent)
                    }

                    is GoalDetailUiState.Failed -> {
                        FailureStateView(current.error.loadMessage(), viewModel::load, Modifier.align(Alignment.Center))
                    }

                    is GoalDetailUiState.Content -> {
                        Details(current.detail, viewModel, ask)
                    }
                }
            }
        }
    }
    val requestId = editorId
    if (requestId != null && detail != null) {
        GoalEditorSheet(requestId, goal = detail.goal, onSaved = viewModel::saved, onClose = { editorId = null })
    }
}

@Composable
private fun Details(
    detail: GoalDetail,
    viewModel: GoalDetailViewModel,
    ask: (String) -> Unit,
) {
    val colors = MichaelTheme.colors
    val goal = detail.goal
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.md),
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
                if (goal.status != GoalStatus.Active) MichaelChip(statusText(goal.status))
                val target = GoalTarget.of(goal, detail.today)
                MichaelChip(
                    listOfNotNull(goal.category, targetText(target)).joinToString(" · "),
                    tone = if (target is GoalTarget.Passed) MichaelChipTone.Warn else MichaelChipTone.Plain,
                )
            }
            MichaelText(goal.title, MichaelTextStyle.Display, colors.text, Modifier.semantics { heading() })
            goal.description?.let { MichaelText(it, MichaelTextStyle.Body, colors.muted) }
        }
        detail.problem?.let { ErrorBanner(it.loadMessage()) }
        Progress(detail, viewModel::setProgress)
        detail.read?.let { ReadCard(goal, it, detail.busy != null, ask, viewModel::setProgress) }
        Milestones(detail, viewModel)
        StatusActions(detail, viewModel)
    }
}

@Composable
private fun Progress(
    detail: GoalDetail,
    onSet: (Int) -> Unit,
) {
    val colors = MichaelTheme.colors
    val goal = detail.goal
    var draft by remember(goal.progress) { mutableStateOf<Float?>(null) }
    val shown = draft?.roundToInt() ?: goal.progress
    MichaelCard {
        Column(Modifier.padding(MichaelSpace.md), verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                MichaelText(stringResource(R.string.goals_detail_progress), MichaelTextStyle.Label, colors.muted, Modifier.weight(1f))
                MichaelText(stringResource(R.string.goals_percent, shown), MichaelTextStyle.Stat, colors.atext)
            }
            MichaelProgressBar(shown / PERCENT.toFloat())
            if (goal.status == GoalStatus.Active) {
                val label = stringResource(R.string.goals_detail_adjust)
                Slider(
                    value = draft ?: goal.progress.toFloat(),
                    onValueChange = { draft = it },
                    onValueChangeFinished = { draft?.let { onSet(it.roundToInt()) } },
                    valueRange = 0f..PERCENT.toFloat(),
                    steps = PROGRESS_STEPS,
                    enabled = detail.busy == null,
                    colors =
                        SliderDefaults.colors(
                            thumbColor = colors.accent,
                            activeTrackColor = colors.accent,
                            inactiveTrackColor = colors.track,
                        ),
                    modifier = Modifier.semantics { contentDescription = label },
                )
            }
            MichaelText(stringResource(R.string.goals_detail_progress_hint), MichaelTextStyle.Caption, colors.faint)
        }
    }
}

/** Michael's read: computed from the goal's saved fields; its actions fill Michael's composer or save progress. */
@Composable
private fun ReadCard(
    goal: Goal,
    read: GoalRead,
    busy: Boolean,
    ask: (String) -> Unit,
    sync: (Int) -> Unit,
) {
    val colors = MichaelTheme.colors
    AICard(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(MichaelSpace.md), horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            MichaelOrb(MichaelOrbSize.Small)
            Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
                MichaelText(stringResource(R.string.goals_read_title), MichaelTextStyle.Eyebrow, colors.muted)
                MichaelText(readText(read), MichaelTextStyle.Body, colors.text)
                val next = read.nextMilestone
                if (next != null) {
                    val prompt = stringResource(R.string.goals_read_break_prompt, next, goal.title)
                    MichaelButton(stringResource(R.string.goals_read_break, next), { ask(prompt) }, size = MichaelButtonSize.Small)
                } else if (read.milestonePercent == null) {
                    val prompt = stringResource(R.string.goals_read_suggest_prompt, goal.title)
                    MichaelButton(stringResource(R.string.goals_read_suggest), { ask(prompt) }, size = MichaelButtonSize.Small)
                }
                if (read.targetPassed) {
                    val prompt = stringResource(R.string.goals_read_target_prompt, goal.title)
                    MichaelButton(
                        stringResource(R.string.goals_read_target),
                        { ask(prompt) },
                        style = MichaelButtonStyle.Secondary,
                        size = MichaelButtonSize.Small,
                    )
                }
                val percent = read.milestonePercent
                if (read.progressDrift && percent != null) {
                    MichaelButton(
                        stringResource(R.string.goals_read_sync, percent),
                        { sync(percent) },
                        style = MichaelButtonStyle.Ghost,
                        size = MichaelButtonSize.Small,
                        enabled = !busy,
                    )
                }
            }
        }
    }
}

/** The milestones: check, rename, move, delete, and add, on an active goal only. */
@Composable
private fun Milestones(
    detail: GoalDetail,
    viewModel: GoalDetailViewModel,
) {
    val colors = MichaelTheme.colors
    val goal = detail.goal
    var renaming by remember { mutableStateOf<GoalMilestone?>(null) }
    var deleting by remember { mutableStateOf<GoalMilestone?>(null) }
    Column {
        Row(Modifier.padding(bottom = MichaelSpace.xs), verticalAlignment = Alignment.CenterVertically) {
            MichaelText(
                stringResource(R.string.goals_milestones),
                MichaelTextStyle.Eyebrow,
                colors.muted,
                Modifier.weight(1f).semantics { heading() },
            )
            if (goal.milestones.isNotEmpty()) {
                MichaelText(
                    pluralStringResource(
                        R.plurals.goals_milestones_count,
                        goal.milestoneCount,
                        goal.completedMilestoneCount,
                        goal.milestoneCount,
                    ),
                    MichaelTextStyle.Caption,
                    colors.muted,
                )
            }
        }
        if (goal.milestones.isEmpty()) {
            MichaelText(
                stringResource(R.string.goals_milestones_none),
                MichaelTextStyle.Body,
                colors.muted,
                Modifier.padding(vertical = MichaelSpace.sm),
            )
        }
        goal.milestones.forEachIndexed { index, milestone ->
            MilestoneRow(detail, milestone, index, viewModel, onRename = { renaming = it }, onDelete = { deleting = it })
        }
        if (goal.status == GoalStatus.Active) AddMilestone(detail.isWorkable, viewModel)
    }
    renaming?.let { milestone -> RenameDialog(milestone, onDismiss = { renaming = null }) { viewModel.rename(milestone, it) } }
    deleting?.let { milestone ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text(stringResource(R.string.goals_milestone_delete_title)) },
            text = { Text(milestone.title) },
            confirmButton = {
                TextButton(onClick = {
                    deleting = null
                    viewModel.delete(milestone)
                }) { Text(stringResource(R.string.goals_milestone_delete), color = colors.danger) }
            },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text(stringResource(R.string.goals_delete_keep)) } },
        )
    }
}

@Composable
private fun MilestoneRow(
    detail: GoalDetail,
    milestone: GoalMilestone,
    index: Int,
    viewModel: GoalDetailViewModel,
    onRename: (GoalMilestone) -> Unit,
    onDelete: (GoalMilestone) -> Unit,
) {
    val colors = MichaelTheme.colors
    val done = detail.isDone(milestone)
    var menu by remember { mutableStateOf(false) }
    Column {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MichaelSpace.md)) {
            MichaelCheck(
                checked = done,
                label =
                    stringResource(
                        if (done) R.string.goals_milestone_reopen else R.string.goals_milestone_complete,
                        milestone.title,
                    ),
                onCheckedChange = { viewModel.toggle(milestone) },
                enabled = detail.isWorkable,
            )
            MichaelText(
                milestone.title,
                MichaelTextStyle.Body,
                if (done) colors.faint else colors.text,
                Modifier.weight(1f),
                textDecoration = if (done) TextDecoration.LineThrough else null,
            )
            if (detail.goal.status == GoalStatus.Active) {
                Box {
                    IconAction(
                        MichaelIcons.more,
                        stringResource(R.string.goals_milestone_actions, milestone.title),
                        enabled = detail.isWorkable,
                    ) { menu = true }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        MenuItem(stringResource(R.string.goals_milestone_rename)) {
                            menu = false
                            onRename(milestone)
                        }
                        if (index > 0) {
                            MenuItem(stringResource(R.string.goals_milestone_up)) {
                                menu = false
                                viewModel.move(milestone, -1)
                            }
                        }
                        if (index < detail.goal.milestones.lastIndex) {
                            MenuItem(stringResource(R.string.goals_milestone_down)) {
                                menu = false
                                viewModel.move(milestone, 1)
                            }
                        }
                        MenuItem(stringResource(R.string.goals_milestone_delete)) {
                            menu = false
                            onDelete(milestone)
                        }
                    }
                }
            }
        }
        HorizontalDivider(color = colors.border)
    }
}

@Composable
private fun MenuItem(
    text: String,
    onClick: () -> Unit,
) {
    DropdownMenuItem(text = { Text(text) }, onClick = onClick)
}

@Composable
private fun AddMilestone(
    enabled: Boolean,
    viewModel: GoalDetailViewModel,
) {
    val colors = MichaelTheme.colors
    var text by rememberSaveable { mutableStateOf("") }
    val label = stringResource(R.string.goals_milestone_add)
    val submit = { if (text.isNotBlank()) viewModel.addMilestone(text) { text = "" } }
    Row(
        Modifier.padding(top = MichaelSpace.sm).michaelFieldFrame(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BasicTextField(
            value = text,
            onValueChange = { text = it.take(GoalForm.TITLE_LIMIT) },
            singleLine = true,
            textStyle = MichaelTextStyle.Body.textStyle.copy(color = colors.text),
            cursorBrush = SolidColor(colors.accent),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { submit() }),
            modifier = Modifier.weight(1f).semantics { contentDescription = label },
            decorationBox = { field ->
                Box {
                    if (text.isEmpty()) MichaelText(label, MichaelTextStyle.Body, colors.faint)
                    field()
                }
            },
        )
        IconAction(MichaelIcons.plus, label, enabled = enabled && text.isNotBlank()) { submit() }
    }
}

@Composable
private fun RenameDialog(
    milestone: GoalMilestone,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    val colors = MichaelTheme.colors
    var text by rememberSaveable(milestone.id) { mutableStateOf(milestone.title) }
    val label = stringResource(R.string.goals_milestone_title)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.goals_milestone_rename)) },
        text = {
            BasicTextField(
                value = text,
                onValueChange = { text = it.take(GoalForm.TITLE_LIMIT) },
                singleLine = true,
                textStyle = MichaelTextStyle.Body.textStyle.copy(color = colors.text),
                cursorBrush = SolidColor(colors.accent),
                modifier = Modifier.michaelFieldFrame().semantics { contentDescription = label },
            )
        },
        confirmButton = {
            TextButton(onClick = {
                onDismiss()
                onSave(text)
            }) { Text(stringResource(R.string.goals_milestone_save), color = colors.atext) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.goals_editor_cancel)) } },
    )
}

@Composable
private fun StatusActions(
    detail: GoalDetail,
    viewModel: GoalDetailViewModel,
) {
    val colors = MichaelTheme.colors
    var confirmingDelete by rememberSaveable { mutableStateOf(false) }
    val enabled = detail.busy == null
    val wide = Modifier.fillMaxWidth()
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        when (detail.goal.status) {
            GoalStatus.Active -> {
                MichaelButton(
                    stringResource(R.string.goals_detail_complete),
                    { viewModel.setStatus(GoalStatus.Completed) },
                    wide,
                    enabled = enabled,
                )
                MichaelButton(
                    stringResource(R.string.goals_detail_archive),
                    { viewModel.setStatus(GoalStatus.Archived) },
                    wide,
                    style = MichaelButtonStyle.Secondary,
                    enabled = enabled,
                )
            }

            GoalStatus.Completed -> {
                MichaelButton(
                    stringResource(R.string.goals_detail_reopen),
                    { viewModel.setStatus(GoalStatus.Active) },
                    wide,
                    style = MichaelButtonStyle.Secondary,
                    enabled = enabled,
                )
            }

            GoalStatus.Archived, GoalStatus.Unknown -> {
                MichaelButton(
                    stringResource(R.string.goals_detail_restore),
                    { viewModel.setStatus(GoalStatus.Active) },
                    wide,
                    style = MichaelButtonStyle.Secondary,
                    enabled = enabled,
                )
            }
        }
        MichaelButton(
            stringResource(R.string.goals_detail_delete),
            { confirmingDelete = true },
            wide,
            style = MichaelButtonStyle.Destructive,
            enabled = enabled,
        )
    }
    if (confirmingDelete) {
        AlertDialog(
            onDismissRequest = { confirmingDelete = false },
            title = { Text(stringResource(R.string.goals_delete_title, detail.goal.title)) },
            text = { Text(stringResource(R.string.goals_delete_message)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmingDelete = false
                    viewModel.delete()
                }) { Text(stringResource(R.string.goals_delete_confirm), color = colors.danger) }
            },
            dismissButton = { TextButton(onClick = { confirmingDelete = false }) { Text(stringResource(R.string.goals_delete_keep)) } },
        )
    }
}

/** 0 to 100 in fives: 19 stops between the ends. */
private const val PROGRESS_STEPS = 19
