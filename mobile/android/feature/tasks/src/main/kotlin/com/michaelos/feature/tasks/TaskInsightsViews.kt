package com.michaelos.feature.tasks

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import com.michaelos.core.designsystem.component.AICard
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonSize
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelCard
import com.michaelos.core.designsystem.component.MichaelChip
import com.michaelos.core.designsystem.component.MichaelChipTone
import com.michaelos.core.designsystem.component.MichaelToggle
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.Classification
import com.michaelos.core.model.GoalLink
import com.michaelos.core.model.RankedTask
import kotlin.math.roundToInt

/** The goals a task supports. Linked goals lift the task in Michael's order as their target dates near. */
@Composable
internal fun TaskGoalsSection(
    state: TaskInsights,
    onToggle: (GoalLink) -> Unit,
) {
    val colors = MichaelTheme.colors
    val locale = androidx.compose.ui.platform.LocalConfiguration.current.locales[0]
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        SectionTitle(stringResource(R.string.tasks_goals_title))
        when {
            state.linked == null -> {
                Spinner(stringResource(R.string.tasks_goals_loading))
            }

            state.goalChoices.isEmpty() -> {
                MichaelText(stringResource(R.string.tasks_goals_none), MichaelTextStyle.Body, colors.muted)
            }

            else -> {
                MichaelCard {
                    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
                        state.goalChoices.forEach { goal ->
                            val label =
                                goal.targetDate?.let {
                                    stringResource(
                                        R.string.tasks_goals_target,
                                        goal.title,
                                        TaskFormat.shortDate(it, locale),
                                    )
                                }
                                    ?: goal.title
                            MichaelToggle(
                                label = label,
                                checked = state.isLinked(goal),
                                onCheckedChange = { onToggle(goal) },
                                enabled = state.busy == null && state.canLink(goal),
                            )
                        }
                    }
                }
                if (state.linked.size >= TaskInsights.GOAL_LIMIT) {
                    MichaelText(stringResource(R.string.tasks_goals_limit), MichaelTextStyle.Caption, colors.muted)
                }
            }
        }
    }
}

/** A task's categories. Michael's suggestions are marked as suggestions, with their confidence, until confirmed. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun TaskCategoriesSection(
    state: TaskInsights,
    viewModel: TaskInsightsViewModel,
) {
    val colors = MichaelTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        SectionTitle(stringResource(R.string.tasks_categories_title))
        when {
            state.classifications == null -> {
                Spinner(stringResource(R.string.tasks_categories_loading))
            }

            state.confirmed.isEmpty() && state.suggestions.isEmpty() -> {
                MichaelText(stringResource(R.string.tasks_categories_none), MichaelTextStyle.Body, colors.muted)
            }
        }
        state.confirmed.forEach { row ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.weight(1f)) { MichaelChip(row.category.name) }
                val label = stringResource(R.string.tasks_categories_remove_label, row.category.name)
                TextButton(
                    onClick = { viewModel.remove(row) },
                    enabled = state.busy == null,
                    modifier =
                        Modifier.semantics {
                            contentDescription =
                                label
                        },
                ) {
                    Text(stringResource(R.string.tasks_categories_remove), color = colors.muted)
                }
            }
        }
        state.suggestions.forEach { row ->
            Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
                MichaelChip(suggestionText(row), tone = MichaelChipTone.Ai)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
                    MichaelButton(
                        stringResource(R.string.tasks_categories_confirm),
                        { viewModel.confirm(row) },
                        style = MichaelButtonStyle.Secondary,
                        size = MichaelButtonSize.Small,
                        enabled = state.busy == null,
                    )
                    MichaelButton(
                        stringResource(R.string.tasks_categories_dismiss),
                        { viewModel.remove(row) },
                        style = MichaelButtonStyle.Ghost,
                        size = MichaelButtonSize.Small,
                        enabled = state.busy == null,
                    )
                }
            }
        }
        if (state.needsAcknowledgement) DataUseNotice(viewModel) else CategoryActions(state, viewModel)
        if (state.noSuggestion) MichaelText(stringResource(R.string.tasks_categories_no_fit), MichaelTextStyle.Caption, colors.muted)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CategoryActions(
    state: TaskInsights,
    viewModel: TaskInsightsViewModel,
) {
    var open by remember { mutableStateOf(false) }
    FlowRow(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm), verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        if (state.busy == TaskInsights.Busy.Suggest) {
            Spinner(stringResource(R.string.tasks_categories_asking))
        } else {
            MichaelButton(
                stringResource(R.string.tasks_categories_suggest),
                { viewModel.suggest() },
                style = MichaelButtonStyle.Secondary,
                size = MichaelButtonSize.Small,
                enabled = state.busy == null,
            )
        }
        if (state.addable.isNotEmpty()) {
            Box {
                MichaelButton(
                    stringResource(R.string.tasks_categories_add),
                    { open = true },
                    style = MichaelButtonStyle.Ghost,
                    size = MichaelButtonSize.Small,
                    enabled = state.busy == null,
                )
                DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                    state.addable.forEach { category ->
                        DropdownMenuItem(text = { Text(category.name) }, onClick = {
                            open = false
                            viewModel.classify(category)
                        })
                    }
                }
            }
        }
    }
}

@Composable
private fun DataUseNotice(viewModel: TaskInsightsViewModel) {
    AICard {
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            MichaelText(stringResource(R.string.tasks_categories_data_use), MichaelTextStyle.Body, MichaelTheme.colors.text)
            Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
                MichaelButton(stringResource(R.string.tasks_categories_data_use_accept), {
                    viewModel.suggest(acknowledged = true)
                }, size = MichaelButtonSize.Small)
                MichaelButton(
                    stringResource(R.string.tasks_categories_data_use_decline),
                    viewModel::declineAcknowledgement,
                    style = MichaelButtonStyle.Ghost,
                    size = MichaelButtonSize.Small,
                )
            }
        }
    }
}

@Composable
private fun suggestionText(row: Classification): String {
    val confidence = row.confidence ?: return stringResource(R.string.tasks_categories_suggested, row.category.name)
    return stringResource(R.string.tasks_categories_suggested_sure, row.category.name, (confidence * PERCENT).roundToInt())
}

@Composable
private fun SectionTitle(text: String) {
    MichaelText(text, MichaelTextStyle.Label, MichaelTheme.colors.muted, modifier = Modifier.semantics { heading() })
}

@Composable
private fun Spinner(label: String) {
    CircularProgressIndicator(Modifier.size(MichaelSize.check).semantics { contentDescription = label }, color = MichaelTheme.colors.accent)
}

/** How Michael ranked one task: every component of the published formula and its points. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PriorityBreakdownSheet(
    item: RankedTask,
    onClose: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val locale = androidx.compose.ui.platform.LocalConfiguration.current.locales[0]
    ModalBottomSheet(onDismissRequest = onClose, containerColor = colors.bg) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(
                    rememberScrollState(),
                ).padding(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.md),
            verticalArrangement = Arrangement.spacedBy(MichaelSpace.md),
        ) {
            MichaelText(
                stringResource(R.string.tasks_why_title),
                MichaelTextStyle.Label,
                colors.muted,
                modifier = Modifier.semantics { heading() },
            )
            MichaelText(item.task.title, MichaelTextStyle.Title, colors.text)
            MichaelText(whyText(item), MichaelTextStyle.Body, colors.muted)
            MichaelCard {
                Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.md)) {
                    breakdown(item).forEach { row ->
                        Column(Modifier.semantics(mergeDescendants = true) {}) {
                            Row {
                                MichaelText(row.label, MichaelTextStyle.Label, colors.text, modifier = Modifier.weight(1f))
                                val points =
                                    row.points?.let {
                                        stringResource(
                                            R.string.tasks_why_points,
                                            String.format(locale, "%.1f", it),
                                        )
                                    }
                                MichaelText(points ?: stringResource(R.string.tasks_why_not_used), MichaelTextStyle.Label, colors.muted)
                            }
                            if (row.reason.isNotEmpty()) MichaelText(row.reason, MichaelTextStyle.Caption, colors.muted)
                        }
                    }
                }
            }
            val score = String.format(locale, "%.1f", item.score)
            MichaelText(
                stringResource(if (item.actionable) R.string.tasks_why_footnote else R.string.tasks_why_footnote_waiting, score),
                MichaelTextStyle.Caption,
                colors.muted,
            )
            TextButton(onClick = onClose, modifier = Modifier.align(Alignment.End)) {
                Text(stringResource(R.string.tasks_why_done), color = colors.atext)
            }
        }
    }
}

private const val PERCENT = 100
