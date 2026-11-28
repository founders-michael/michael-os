package com.michaelos.feature.goals

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
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.vector.ImageVector
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
import com.michaelos.core.designsystem.component.EmptyStateView
import com.michaelos.core.designsystem.component.FailureStateView
import com.michaelos.core.designsystem.component.MichaelBackButton
import com.michaelos.core.designsystem.component.MichaelBackground
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonSize
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelCard
import com.michaelos.core.designsystem.component.MichaelIcons
import com.michaelos.core.designsystem.component.MichaelProgressBar
import com.michaelos.core.designsystem.component.MichaelSegmentedControl
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.Goal
import com.michaelos.core.model.GoalStatus
import java.time.LocalDate
import java.util.UUID

/** Where the goal screens send the user. */
class GoalsActions(
    /** Opens Michael with a question or a drafting request filled in. It is never sent on the user's behalf. */
    val ask: (String) -> Unit,
    val open: (GoalDetailKey) -> Unit,
    val back: () -> Unit,
)

/** The Goals screen, pushed from More. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GoalsScreen(
    actions: GoalsActions,
    viewModel: GoalsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_START) { viewModel.load() }
    var editorId by rememberSaveable { mutableStateOf<String?>(null) }
    MichaelBackground(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = MichaelSpace.sm), verticalAlignment = Alignment.CenterVertically) {
                MichaelBackButton(actions.back)
                MichaelText(
                    stringResource(R.string.goals_title),
                    MichaelTextStyle.Label,
                    MichaelTheme.colors.text,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                IconAction(MichaelIcons.plus, stringResource(R.string.goals_new)) { editorId = UUID.randomUUID().toString() }
            }
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when (val current = state) {
                    GoalsUiState.Loading -> {
                        val label = stringResource(R.string.goals_loading)
                        CircularProgressIndicator(
                            Modifier.align(Alignment.Center).semantics { contentDescription = label },
                            color = MichaelTheme.colors.accent,
                        )
                    }

                    is GoalsUiState.Failed -> {
                        FailureStateView(current.error.loadMessage(), viewModel::load, Modifier.align(Alignment.Center))
                    }

                    is GoalsUiState.Content -> {
                        PullToRefreshBox(isRefreshing = false, onRefresh = viewModel::load) {
                            GoalCards(current.list, viewModel, actions) { editorId = UUID.randomUUID().toString() }
                        }
                    }
                }
            }
        }
    }
    val requestId = editorId
    if (requestId != null) {
        GoalEditorSheet(requestId, goal = null, onSaved = viewModel::saved, onClose = { editorId = null })
    }
}

@Composable
private fun GoalCards(
    list: GoalList,
    viewModel: GoalsViewModel,
    actions: GoalsActions,
    onNew: () -> Unit,
) {
    val shown = list.shown
    val draftPrompt = stringResource(R.string.goals_draft_prompt)
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.md),
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.md),
    ) {
        item {
            MichaelButton(
                stringResource(R.string.goals_draft),
                onClick = { actions.ask(draftPrompt) },
                style = MichaelButtonStyle.Secondary,
                size = MichaelButtonSize.Small,
            )
        }
        item {
            MichaelSegmentedControl(
                options = listOf(GoalStatus.Active, GoalStatus.Completed, GoalStatus.Archived),
                selected = list.filter,
                onSelect = viewModel::show,
                title = { "${statusText(it)} · ${list.count(it)}" },
            )
        }
        if (shown.isEmpty()) {
            item { Empty(list.filter, onNew) }
        } else {
            items(shown, key = { it.id }) { goal -> GoalCard(goal, list.today) { actions.open(GoalDetailKey(goal.id)) } }
        }
    }
}

/** A goal in the list: category, title, manual progress, milestone count and when it is due. */
@Composable
private fun GoalCard(
    goal: Goal,
    today: LocalDate,
    onOpen: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val target = GoalTarget.of(goal, today)
    MichaelCard(Modifier.clickable(role = Role.Button, onClick = onOpen)) {
        Column(Modifier.padding(MichaelSpace.md), verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            goal.category?.let { MichaelText(it, MichaelTextStyle.Eyebrow, colors.muted) }
            Row(verticalAlignment = Alignment.CenterVertically) {
                MichaelText(goal.title, MichaelTextStyle.Heading, colors.text, Modifier.weight(1f))
                MichaelText(stringResource(R.string.goals_percent, goal.progress), MichaelTextStyle.Label, colors.atext)
            }
            MichaelProgressBar(goal.progress / PERCENT.toFloat())
            Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
                MichaelText(milestonesText(goal), MichaelTextStyle.Caption, colors.muted, Modifier.weight(1f))
                MichaelText(targetText(target), MichaelTextStyle.Caption, if (target is GoalTarget.Passed) colors.warn else colors.muted)
            }
        }
    }
}

@Composable
private fun Empty(
    filter: GoalStatus,
    onNew: () -> Unit,
) {
    if (filter == GoalStatus.Active) {
        EmptyStateView(
            title = stringResource(R.string.goals_empty_title),
            message = stringResource(R.string.goals_empty_message),
            actionText = stringResource(R.string.goals_new),
            onAction = onNew,
            modifier = Modifier.padding(vertical = MichaelSpace.xl),
        )
    } else {
        MichaelText(
            stringResource(if (filter == GoalStatus.Completed) R.string.goals_empty_completed else R.string.goals_empty_archived),
            MichaelTextStyle.Body,
            MichaelTheme.colors.muted,
            Modifier.fillMaxWidth().padding(vertical = MichaelSpace.xxl),
            textAlign = TextAlign.Center,
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
