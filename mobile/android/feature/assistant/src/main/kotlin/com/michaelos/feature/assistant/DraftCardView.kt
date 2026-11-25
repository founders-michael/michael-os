package com.michaelos.feature.assistant

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.michaelos.core.designsystem.component.AICard
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonSize
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.DraftKind
import com.michaelos.core.model.DraftValue

internal data class DraftCardActions(
    val edit: (String, DraftValue?) -> Unit,
    val save: () -> Unit,
    val discard: () -> Unit,
    val open: (Destination) -> Unit,
)

/**
 * An unsaved record Michael proposed, as a real form. The AI border and "Not saved" mean nothing is saved yet; the card
 * says saved only after the create call has returned.
 */
@Composable
internal fun DraftCardView(
    card: DraftCard,
    actions: DraftCardActions,
) {
    val colors = MichaelTheme.colors
    val haptics = LocalHapticFeedback.current
    val title = stringResource(titleOf(card.form.kind))
    LaunchedEffect(card.status) { if (card.status == DraftCard.Status.Saved) haptics.performHapticFeedback(HapticFeedbackType.Confirm) }
    LaunchedEffect(card.error) { if (card.error != null) haptics.performHapticFeedback(HapticFeedbackType.Reject) }
    AICard(Modifier.semantics { contentDescription = title }) {
        if (card.status == DraftCard.Status.Discarded) {
            MichaelText(stringResource(R.string.draft_discarded), MichaelTextStyle.Label, colors.muted)
            return@AICard
        }
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.md)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                MichaelText(title, MichaelTextStyle.Eyebrow, colors.atext, modifier = Modifier.weight(1f))
                MichaelText(
                    stringResource(statusOf(card.status)),
                    MichaelTextStyle.Caption,
                    if (card.status == DraftCard.Status.Saved) colors.atext else colors.muted,
                )
            }
            val missing = card.form.missing
            if (card.status != DraftCard.Status.Saved && missing.isNotEmpty()) {
                val labels =
                    missing.map { name ->
                        card.form.fields
                            .firstOrNull { it.name == name }
                            ?.let { stringResource(it.label) }
                            ?: name
                    }
                MichaelText(stringResource(R.string.draft_missing, labels.joinToString(", ")), MichaelTextStyle.Caption, colors.warn)
            }
            card.form.fields.forEach { field ->
                DraftFieldEditor(
                    field = field,
                    form = card.form,
                    missing = card.status != DraftCard.Status.Saved && field.name in missing,
                    error = card.fieldErrors[field.name],
                    enabled = card.status == DraftCard.Status.Editing,
                ) { actions.edit(field.name, it) }
            }
            if (card.form.kind == DraftKind.CalendarEvent && card.status != DraftCard.Status.Saved) {
                MichaelText(stringResource(R.string.draft_time_zone, card.form.timeZone), MichaelTextStyle.Caption, colors.muted)
            }
            card.error?.let { MichaelText(reasonText(it), MichaelTextStyle.Label, colors.danger) }
            Footer(card, actions)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Footer(
    card: DraftCard,
    actions: DraftCardActions,
) {
    val colors = MichaelTheme.colors
    if (card.status == DraftCard.Status.Saved) {
        // Wraps rather than squeezing "Saved." into a broken word at the largest font scales.
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
            verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
        ) {
            MichaelText(
                stringResource(R.string.draft_saved),
                MichaelTextStyle.Label,
                colors.atext,
                modifier = Modifier.align(Alignment.CenterVertically),
            )
            destinationOf(card.form.kind)?.let { destination ->
                MichaelButton(
                    stringResource(openOf(destination)),
                    { actions.open(destination) },
                    style = MichaelButtonStyle.Ghost,
                    size = MichaelButtonSize.Small,
                )
            }
        }
        return
    }
    val editing = card.status == DraftCard.Status.Editing
    Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        MichaelButton(
            stringResource(saveOf(card.form.kind)),
            actions.save,
            modifier = Modifier.weight(1f),
            enabled = editing && card.form.submission != null,
        )
        MichaelButton(stringResource(R.string.draft_discard), actions.discard, style = MichaelButtonStyle.Secondary, enabled = editing)
    }
}

@StringRes
private fun statusOf(status: DraftCard.Status): Int =
    when (status) {
        DraftCard.Status.Editing, DraftCard.Status.Discarded -> R.string.draft_status_not_saved
        DraftCard.Status.Saving -> R.string.draft_status_saving
        DraftCard.Status.Saved -> R.string.draft_status_saved
    }

@StringRes
private fun titleOf(kind: DraftKind): Int =
    when (kind) {
        DraftKind.Task -> R.string.draft_title_task
        DraftKind.Goal -> R.string.draft_title_goal
        DraftKind.Habit -> R.string.draft_title_habit
        DraftKind.CalendarEvent -> R.string.draft_title_calendar_event
        DraftKind.Memory -> R.string.draft_title_memory
        DraftKind.Unknown -> R.string.draft_title_unknown
    }

@StringRes
private fun saveOf(kind: DraftKind): Int =
    when (kind) {
        DraftKind.Task -> R.string.draft_save_task
        DraftKind.Goal -> R.string.draft_save_goal
        DraftKind.Habit -> R.string.draft_save_habit
        DraftKind.CalendarEvent -> R.string.draft_save_calendar_event
        DraftKind.Memory -> R.string.draft_save_memory
        DraftKind.Unknown -> R.string.draft_save_unknown
    }

@StringRes
private fun openOf(destination: Destination): Int =
    when (destination) {
        Destination.Tasks -> R.string.draft_open_tasks
        Destination.Goals -> R.string.draft_open_goals
        Destination.Habits -> R.string.draft_open_habits
        Destination.Calendar -> R.string.draft_open_calendar
        Destination.Settings -> R.string.draft_open_settings
    }
