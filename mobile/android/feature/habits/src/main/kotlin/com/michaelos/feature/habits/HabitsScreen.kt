package com.michaelos.feature.habits

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.michaelos.core.designsystem.component.AICard
import com.michaelos.core.designsystem.component.EmptyStateView
import com.michaelos.core.designsystem.component.FailureStateView
import com.michaelos.core.designsystem.component.MichaelBackButton
import com.michaelos.core.designsystem.component.MichaelBackground
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonSize
import com.michaelos.core.designsystem.component.MichaelCheck
import com.michaelos.core.designsystem.component.MichaelIcons
import com.michaelos.core.designsystem.component.MichaelOrb
import com.michaelos.core.designsystem.component.MichaelOrbSize
import com.michaelos.core.designsystem.component.MichaelSegmentedControl
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Habit
import com.michaelos.core.model.HabitStatus
import java.util.UUID

/** Where the habit screens send the user. */
class HabitsActions(
    /** Opens Michael with a question or a drafting request filled in. It is never sent on the user's behalf. */
    val ask: (String) -> Unit,
    val open: (HabitDetailKey) -> Unit,
    val back: () -> Unit,
)

/** The Habits screen, pushed from More. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HabitsScreen(
    actions: HabitsActions,
    viewModel: HabitsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_START) { viewModel.load() }
    var editorId by rememberSaveable { mutableStateOf<String?>(null) }
    val haptics = LocalHapticFeedback.current
    val rollbacks = viewModel.list?.rollbacks?.size ?: 0
    var rollbacksSeen by remember { mutableIntStateOf(0) }
    LaunchedEffect(rollbacks) {
        if (rollbacks > rollbacksSeen) haptics.performHapticFeedback(HapticFeedbackType.Reject)
        rollbacksSeen = rollbacks
    }
    MichaelBackground(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = MichaelSpace.sm), verticalAlignment = Alignment.CenterVertically) {
                MichaelBackButton(actions.back)
                MichaelText(
                    stringResource(R.string.habits_title),
                    MichaelTextStyle.Label,
                    MichaelTheme.colors.text,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                IconAction(MichaelIcons.plus, stringResource(R.string.habits_new)) { editorId = UUID.randomUUID().toString() }
            }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when (val current = state) {
                    HabitsUiState.Loading -> {
                        CircularProgressIndicator(Modifier.align(Alignment.Center), color = MichaelTheme.colors.accent)
                    }

                    is HabitsUiState.Failed -> {
                        FailureStateView(current.error.loadMessage(), viewModel::load, Modifier.align(Alignment.Center))
                    }

                    is HabitsUiState.Content -> {
                        PullToRefreshBox(isRefreshing = false, onRefresh = viewModel::load) {
                            HabitList(current.list, viewModel, actions) { editorId = UUID.randomUUID().toString() }
                        }
                    }
                }
            }
        }
    }
    val requestId = editorId
    if (requestId != null) {
        HabitEditorSheet(requestId, habit = null, onSaved = viewModel::saved, onClose = { editorId = null })
    }
}

@Composable
private fun HabitList(
    list: HabitList,
    viewModel: HabitsViewModel,
    actions: HabitsActions,
    onNew: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val shown = list.shown
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding =
            androidx.compose.foundation.layout.PaddingValues(
                horizontal = MichaelSpace.screenGutter,
                vertical = MichaelSpace.md,
            ),
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.md),
    ) {
        val line = list.line
        if (line != null && !list.showsArchived) item { LineCard(line, actions.ask) }
        item { CaptureBar(actions.ask) }
        item {
            MichaelText(
                pluralStringResource(R.plurals.habits_today, list.scheduledToday, list.completedToday, list.scheduledToday),
                MichaelTextStyle.Label,
                colors.muted,
            )
        }
        item {
            MichaelSegmentedControl(
                options = listOf(false, true),
                selected = list.showsArchived,
                onSelect = viewModel::showArchived,
                title = { stringResource(if (it) R.string.habits_archived else R.string.habits_active) },
            )
        }
        if (shown.isEmpty()) {
            item { Empty(list.showsArchived, onNew) }
        } else {
            sections(list, shown, viewModel, actions)
        }
    }
}

private fun LazyListScope.sections(
    list: HabitList,
    shown: List<Habit>,
    viewModel: HabitsViewModel,
    actions: HabitsActions,
) {
    val today = shown.filter { it.dueToday }
    val rest = shown.filterNot { it.dueToday }
    if (today.isNotEmpty()) {
        item { SectionTitle(stringResource(R.string.habits_section_today)) }
        items(today, key = { it.id }) { habit -> HabitRow(habit, list, viewModel, actions) }
    }
    if (rest.isNotEmpty()) {
        item { SectionTitle(stringResource(if (list.showsArchived) R.string.habits_section_archived else R.string.habits_section_other)) }
        items(rest, key = { it.id }) { habit -> HabitRow(habit, list, viewModel, actions) }
    }
}

@Composable
private fun SectionTitle(text: String) {
    MichaelText(text, MichaelTextStyle.Eyebrow, MichaelTheme.colors.muted, Modifier.semantics { heading() })
}

/** A habit in the list: today's check (when scheduled), the name, the schedule and the streak. */
@Composable
private fun HabitRow(
    habit: Habit,
    list: HabitList,
    viewModel: HabitsViewModel,
    actions: HabitsActions,
) {
    val colors = MichaelTheme.colors
    val done = list.isDone(habit)
    val problem: AppError? = list.rollbacks[habit.id]
    Column(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(MichaelSpace.md)) {
            if (habit.dueToday) {
                val label =
                    if (done) stringResource(R.string.habits_undo, habit.title) else stringResource(R.string.habits_check_in, habit.title)
                MichaelCheck(checked = done, label = label, onCheckedChange = { viewModel.toggle(habit.id) })
            }
            Row(
                Modifier
                    .weight(1f)
                    .clickable(role = Role.Button) { actions.open(HabitDetailKey(habit.id)) }
                    .padding(vertical = MichaelSpace.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
                    MichaelText(habit.title, MichaelTextStyle.Body, colors.text)
                    MichaelText(scheduleText(habit), MichaelTextStyle.Caption, colors.muted)
                    if (habit.status == HabitStatus.Active && !habit.todayScheduled) {
                        MichaelText(stringResource(R.string.habits_not_today), MichaelTextStyle.Caption, colors.faint)
                    }
                }
                if (habit.currentStreak > 0) {
                    MichaelText(
                        pluralStringResource(R.plurals.habits_streak, habit.currentStreak, habit.currentStreak),
                        MichaelTextStyle.Label,
                        colors.atext,
                    )
                }
                Image(MichaelIcons.chevronRight, null, Modifier.size(MichaelSize.check), colorFilter = ColorFilter.tint(colors.faint))
            }
        }
        if (problem != null) MichaelText(problem.rollbackMessage(), MichaelTextStyle.Caption, colors.danger)
        HorizontalDivider(Modifier.padding(top = MichaelSpace.sm), color = colors.border)
    }
}

/** Michael's line: computed from the habits on screen; its action fills Michael's composer. */
@Composable
private fun LineCard(
    line: HabitLine,
    ask: (String) -> Unit,
) {
    val prompt = (line as? HabitLine.Next)?.let { stringResource(R.string.habits_line_prompt, it.habit.title) }
    AICard(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(MichaelSpace.md), horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            MichaelOrb(MichaelOrbSize.Small)
            Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
                MichaelText(lineText(line), MichaelTextStyle.Body, MichaelTheme.colors.text)
                if (prompt != null) {
                    MichaelButton(stringResource(R.string.habits_line_action), onClick = { ask(prompt) }, size = MichaelButtonSize.Small)
                }
            }
        }
    }
}

/** Natural-language capture: the words go to Michael as a drafting request, which the user then sends. */
@Composable
private fun CaptureBar(ask: (String) -> Unit) {
    val colors = MichaelTheme.colors
    var text by rememberSaveable { mutableStateOf("") }
    val prompt = stringResource(R.string.habits_capture_prompt, text.trim())
    val send = {
        if (text.isNotBlank()) {
            ask(prompt)
            text = ""
        }
    }
    AICard(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(start = MichaelSpace.md, end = MichaelSpace.xs), verticalAlignment = Alignment.CenterVertically) {
            val label = stringResource(R.string.habits_capture_label)
            BasicTextField(
                value = text,
                onValueChange = { text = it.take(HabitForm.TITLE_LIMIT) },
                maxLines = 3,
                textStyle = MichaelTextStyle.Body.textStyle.copy(color = colors.text),
                cursorBrush = SolidColor(colors.accent),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { send() }),
                modifier = Modifier.weight(1f).padding(vertical = MichaelSpace.md).semantics { contentDescription = label },
                decorationBox = { field ->
                    Box {
                        if (text.isEmpty()) {
                            MichaelText(
                                stringResource(R.string.habits_capture_placeholder),
                                MichaelTextStyle.Body,
                                colors.faint,
                            )
                        }
                        field()
                    }
                },
            )
            IconAction(MichaelIcons.arrowRight, stringResource(R.string.habits_capture_send), enabled = text.isNotBlank()) { send() }
        }
    }
}

@Composable
private fun Empty(
    archived: Boolean,
    onNew: () -> Unit,
) {
    if (archived) {
        MichaelText(
            stringResource(R.string.habits_empty_archived),
            MichaelTextStyle.Body,
            MichaelTheme.colors.muted,
            Modifier.fillMaxWidth().padding(vertical = MichaelSpace.xxl),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
    } else {
        EmptyStateView(
            title = stringResource(R.string.habits_empty_title),
            message = stringResource(R.string.habits_empty_message),
            actionText = stringResource(R.string.habits_new),
            onAction = onNew,
            modifier = Modifier.padding(vertical = MichaelSpace.xl),
        )
    }
}

@Composable
internal fun IconAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
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
