package com.michaelos.feature.calendar

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.michaelos.core.designsystem.component.ErrorBanner
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelCheck
import com.michaelos.core.designsystem.component.MichaelDatePickerDialog
import com.michaelos.core.designsystem.component.MichaelFieldButton
import com.michaelos.core.designsystem.component.MichaelOrb
import com.michaelos.core.designsystem.component.MichaelOrbActivity
import com.michaelos.core.designsystem.component.MichaelOrbSize
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.ProposedSession
import java.time.LocalDate

/**
 * Ask Michael's planner for sessions over a few days, untick the ones not wanted, and apply the rest. Nothing reaches
 * the calendar until Apply; closing keeps the plan on the day view until it is applied or discarded.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PlanSheet(
    content: CalendarContent,
    viewModel: CalendarViewModel,
    onOpenAvailability: () -> Unit,
) {
    val step = content.plan ?: return
    val sheet =
        rememberModalBottomSheetState(skipPartiallyExpanded = true, confirmValueChange = {
            it != SheetValue.Hidden ||
                step != PlanStep.Applying
        })
    ModalBottomSheet(onDismissRequest = viewModel::closePlan, sheetState = sheet, containerColor = MichaelTheme.colors.bg) {
        Column(Modifier.fillMaxWidth()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = MichaelSpace.sm), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = viewModel::closePlan, enabled = step != PlanStep.Applying) {
                    Text(stringResource(R.string.calendar_sheet_close), color = MichaelTheme.colors.text)
                }
                MichaelText(stringResource(R.string.calendar_plan_title), MichaelTextStyle.Label, MichaelTheme.colors.text)
            }
            Column(
                Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).padding(horizontal = MichaelSpace.screenGutter),
                verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg),
            ) {
                when (step) {
                    PlanStep.Choosing -> Choosing(content, viewModel)
                    PlanStep.Asking -> Working(stringResource(R.string.calendar_plan_asking))
                    PlanStep.Reviewing, PlanStep.Applying -> Reviewing(content, viewModel, onOpenAvailability)
                    is PlanStep.Applied -> Intro(pluralStringResource(R.plurals.calendar_plan_applied, step.count, step.count))
                    is PlanStep.Failed -> ErrorBanner(step.problem.message())
                }
            }
            Footer(content, step, viewModel)
        }
    }
}

@Composable
private fun Choosing(
    content: CalendarContent,
    viewModel: CalendarViewModel,
) {
    Intro(stringResource(R.string.calendar_plan_choose))
    DateField(stringResource(R.string.calendar_plan_from), content.range.first) { viewModel.setRange(content.range.withFirst(it)) }
    DateField(stringResource(R.string.calendar_plan_to), content.range.last) { viewModel.setRange(content.range.copy(last = it)) }
    val colors = MichaelTheme.colors
    if (!content.range.isValid(content.today)) {
        MichaelText(stringResource(R.string.calendar_plan_invalid), MichaelTextStyle.Caption, colors.danger)
    }
    MichaelText(stringResource(R.string.calendar_plan_zone, content.clock.zone), MichaelTextStyle.Caption, colors.faint)
}

@Composable
private fun DateField(
    label: String,
    date: LocalDate,
    onPick: (LocalDate) -> Unit,
) {
    var picking by rememberSaveable { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
        MichaelText(label, MichaelTextStyle.Label, MichaelTheme.colors.muted)
        MichaelFieldButton(text = CalendarFormat.fullDate(date), label = label, onClick = { picking = true })
    }
    if (picking) MichaelDatePickerDialog(initial = date, onPick = onPick, onDismiss = { picking = false })
}

@Composable
private fun Working(text: String) {
    Row(
        Modifier.semantics(mergeDescendants = true) {
        },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.md),
    ) {
        MichaelOrb(MichaelOrbSize.Small, activity = MichaelOrbActivity.Thinking)
        MichaelText(text, MichaelTextStyle.Body, MichaelTheme.colors.muted)
    }
}

@Composable
private fun Intro(text: String) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(MichaelSpace.md)) {
        MichaelOrb(MichaelOrbSize.Small)
        MichaelText(text, MichaelTextStyle.Body, MichaelTheme.colors.text, Modifier.weight(1f))
    }
}

@Composable
private fun Reviewing(
    content: CalendarContent,
    viewModel: CalendarViewModel,
    onOpenAvailability: () -> Unit,
) {
    val review = content.review ?: return
    if (review.sessions.isEmpty()) {
        Intro(stringResource(R.string.calendar_plan_none))
    } else {
        Intro(pluralStringResource(R.plurals.calendar_plan_found, review.sessions.size, review.sessions.size))
        Column {
            review.sessions.forEach { session -> SessionRow(session, review, content.clock) { viewModel.toggle(session) } }
        }
    }
    if (review.needsAvailability) {
        Notice(
            stringResource(R.string.calendar_plan_needs_availability),
            stringResource(R.string.calendar_no_availability_action),
            onOpenAvailability,
        )
    }
    review.notPlaced.forEach { (title, reason) ->
        Notice(if (title != null) stringResource(R.string.calendar_plan_not_placed, title, reason) else reason)
    }
    review.notes.forEach { Notice(it) }
}

@Composable
private fun SessionRow(
    session: ProposedSession,
    review: PlanReview,
    clock: ZonedClock,
    onToggle: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val title = review.title(session.taskId).orEmpty()
    val time = CalendarFormat.session(session.startAt, session.endAt, clock)
    val kept = review.isKept(session)
    Row(
        Modifier.fillMaxWidth().heightIn(min = MichaelSize.button + MichaelSpace.lg),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.md),
    ) {
        MichaelCheck(kept, "$title, $time", { onToggle() })
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs / 2)) {
            MichaelText(title, MichaelTextStyle.Body, if (kept) colors.text else colors.faint, maxLines = 2)
            MichaelText(time, MichaelTextStyle.Caption, colors.muted)
            if (session.sessionCount > 1) {
                MichaelText(
                    stringResource(R.string.calendar_plan_part, session.sessionIndex, session.sessionCount),
                    MichaelTextStyle.Caption,
                    colors.faint,
                )
            }
        }
    }
}

@Composable
private fun Notice(
    text: String,
    action: String? = null,
    onAction: () -> Unit = {},
) {
    val colors = MichaelTheme.colors
    Column(
        Modifier.fillMaxWidth().background(colors.warnBg, RoundedCornerShape(MichaelRadius.stat)).padding(MichaelSpace.md),
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
    ) {
        MichaelText(text, MichaelTextStyle.Label, colors.warn)
        if (action != null) {
            MichaelText(
                action,
                MichaelTextStyle.Label,
                colors.atext,
                Modifier
                    .heightIn(
                        min = MichaelSize.checkTouch,
                    ).clickable(role = Role.Button, onClick = onAction)
                    .padding(vertical = MichaelSpace.md),
            )
        }
    }
}

@Composable
private fun Footer(
    content: CalendarContent,
    step: PlanStep,
    viewModel: CalendarViewModel,
) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.md),
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs),
    ) {
        val full = Modifier.fillMaxWidth()
        when (step) {
            PlanStep.Choosing -> {
                MichaelButton(
                    stringResource(R.string.calendar_plan_ask),
                    viewModel::ask,
                    full,
                    enabled = content.range.isValid(content.today),
                )
            }

            PlanStep.Asking -> {}

            PlanStep.Reviewing, PlanStep.Applying -> {
                val review = content.review
                if (review != null && review.sessions.isNotEmpty()) {
                    if (step == PlanStep.Applying) {
                        val label = stringResource(R.string.calendar_plan_applying)
                        CircularProgressIndicator(
                            Modifier.align(Alignment.CenterHorizontally).semantics { contentDescription = label },
                            color = MichaelTheme.colors.accent,
                        )
                    } else {
                        MichaelButton(
                            if (review.keptCount == 0) {
                                stringResource(R.string.calendar_plan_pick_one)
                            } else {
                                pluralStringResource(R.plurals.calendar_plan_apply, review.keptCount, review.keptCount)
                            },
                            viewModel::apply,
                            full,
                            enabled = review.keptCount > 0,
                        )
                    }
                }
                if (step == PlanStep.Reviewing) {
                    MichaelButton(
                        stringResource(R.string.calendar_plan_again),
                        viewModel::startOver,
                        full,
                        style = MichaelButtonStyle.Ghost,
                    )
                }
            }

            is PlanStep.Applied -> {
                MichaelButton(stringResource(R.string.calendar_plan_done), viewModel::closePlan, full)
            }

            is PlanStep.Failed -> {
                if (step.problem is PlanProblem.Unavailable) {
                    MichaelButton(stringResource(R.string.calendar_plan_retry), viewModel::retry, full)
                } else {
                    MichaelButton(stringResource(R.string.calendar_plan_again), viewModel::startOver, full)
                }
            }
        }
    }
}
