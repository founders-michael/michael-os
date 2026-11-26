package com.michaelos.feature.tasks

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonSize
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelDatePickerDialog
import com.michaelos.core.designsystem.component.MichaelFieldButton
import com.michaelos.core.designsystem.component.MichaelFieldTone
import com.michaelos.core.designsystem.component.MichaelIcons
import com.michaelos.core.designsystem.component.MichaelSegmentedControl
import com.michaelos.core.designsystem.component.MichaelTimePickerDialog
import com.michaelos.core.designsystem.component.MichaelWeekdayPicker
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.RecurrenceFrequency
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/** A calendar date that may be empty. */
@Composable
internal fun OptionalDateField(
    label: String,
    date: LocalDate?,
    start: () -> LocalDate,
    addText: String,
    clearLabel: String,
    tone: MichaelFieldTone = MichaelFieldTone.Plain,
    onChange: (LocalDate?) -> Unit,
) {
    var picking by remember { mutableStateOf(false) }
    MichaelFieldButton(
        text = date?.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)) ?: addText,
        label = label,
        onClick = { picking = true },
        tone = tone,
        clearLabel = clearLabel,
        onClear = if (date != null) ({ onChange(null) }) else null,
    )
    if (picking) MichaelDatePickerDialog(date ?: start(), onChange) { picking = false }
}

@Composable
internal fun RepeatField(
    state: TaskEditorUiState,
    message: String?,
    edit: ((TaskForm) -> TaskForm) -> Unit,
) {
    val colors = MichaelTheme.colors
    val draft = state.form.repeat
    val due = state.form.dueDate
    var open by remember { mutableStateOf(false) }
    val set = { change: (RepeatDraft) -> RepeatDraft -> edit { it.copy(repeat = change(it.repeat)) } }
    Labelled(stringResource(R.string.tasks_editor_repeat), message) {
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            Box {
                MichaelFieldButton(presetTitle(draft.preset, due), stringResource(R.string.tasks_editor_repeat), {
                    open = true
                }, tone = toneOf(message), trailing = MichaelIcons.choose)
                DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                    RepeatDraft.Preset.entries.forEach { preset ->
                        DropdownMenuItem(text = { Text(presetTitle(preset, due)) }, onClick = {
                            open = false
                            set { it.copy(preset = preset) }
                        })
                    }
                }
            }
            if (draft.preset == RepeatDraft.Preset.Custom) CustomRepeat(draft, due, state, set)
            val rule = draft.rule(due)
            if (rule != null && (due != null || draft.preset == RepeatDraft.Preset.Custom)) {
                MichaelText(repeatSummary(rule), MichaelTextStyle.Caption, colors.muted)
            }
            if (draft.preset !=
                RepeatDraft.Preset.None
            ) {
                MichaelText(stringResource(R.string.tasks_editor_repeat_hint), MichaelTextStyle.Caption, colors.faint)
            }
        }
    }
}

@Composable
private fun CustomRepeat(
    draft: RepeatDraft,
    due: LocalDate?,
    state: TaskEditorUiState,
    set: ((RepeatDraft) -> RepeatDraft) -> Unit,
) {
    val colors = MichaelTheme.colors
    Stepper(stringResource(R.string.tasks_editor_repeat_every, draft.interval), draft.interval, RepeatDraft.INTERVALS) { value ->
        set { it.copy(interval = value) }
    }
    MichaelSegmentedControl(
        options = listOf(RecurrenceFrequency.Daily, RecurrenceFrequency.Weekly, RecurrenceFrequency.Monthly),
        selected = draft.frequency,
        onSelect = { value -> set { it.copy(frequency = value) } },
        title = { unitTitle(it) },
    )
    when (draft.frequency) {
        RecurrenceFrequency.Weekly -> {
            MichaelWeekdayPicker(draft.weekdays, { days -> set { it.copy(weekdays = days) } })
        }

        RecurrenceFrequency.Monthly -> {
            Stepper(
                stringResource(R.string.tasks_editor_repeat_month_day, draft.monthDay),
                draft.monthDay,
                RepeatDraft.MONTH_DAYS,
            ) { value ->
                set { it.copy(monthDay = value) }
            }
            MichaelText(stringResource(R.string.tasks_editor_repeat_short_month), MichaelTextStyle.Caption, colors.faint)
        }

        RecurrenceFrequency.Daily, RecurrenceFrequency.Unknown -> {}
    }
    MichaelText(stringResource(R.string.tasks_editor_repeat_ends), MichaelTextStyle.Label, colors.muted)
    OptionalDateField(
        label = stringResource(R.string.tasks_editor_repeat_ends),
        date = draft.endsOn,
        start = { due ?: state.today ?: LocalDate.now(zoneOf(state.timeZone)) },
        addText = stringResource(R.string.tasks_editor_repeat_ends_add),
        clearLabel = stringResource(R.string.tasks_editor_repeat_ends_clear),
    ) { value -> set { it.copy(endsOn = value) } }
}

@Composable
private fun Stepper(
    text: String,
    value: Int,
    range: IntRange,
    onChange: (Int) -> Unit,
) {
    val colors = MichaelTheme.colors
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        MichaelText(text, MichaelTextStyle.Body, colors.text, modifier = Modifier.weight(1f))
        MichaelButton(
            stringResource(R.string.tasks_editor_step_down),
            {
                onChange((value - 1).coerceIn(range))
            },
            style = MichaelButtonStyle.Secondary,
            size = MichaelButtonSize.Small,
            enabled =
                value > range.first,
        )
        MichaelButton(
            stringResource(R.string.tasks_editor_step_up),
            {
                onChange((value + 1).coerceIn(range))
            },
            style = MichaelButtonStyle.Secondary,
            size = MichaelButtonSize.Small,
            enabled =
                value < range.last,
        )
    }
}

@Composable
internal fun ReminderField(
    state: TaskEditorUiState,
    message: String?,
    edit: ((TaskForm) -> TaskForm) -> Unit,
) {
    val colors = MichaelTheme.colors
    val form = state.form
    var pickingDate by remember { mutableStateOf(false) }
    var pickingTime by remember { mutableStateOf(false) }
    Labelled(stringResource(R.string.tasks_editor_reminder), message) {
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            val date = form.reminderDate
            if (date == null) {
                MichaelFieldButton(stringResource(R.string.tasks_editor_reminder_add), stringResource(R.string.tasks_editor_reminder), {
                    edit {
                        it.copy(
                            reminderDate = it.dueDate ?: state.today ?: LocalDate.now(zoneOf(state.timeZone)),
                            reminderTime = DEFAULT_TIME,
                        )
                    }
                })
            } else {
                MichaelFieldButton(
                    text = date.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)),
                    label = stringResource(R.string.tasks_editor_reminder_date),
                    onClick = { pickingDate = true },
                    tone = toneOf(message),
                    clearLabel = stringResource(R.string.tasks_editor_reminder_clear),
                    onClear = { edit { it.copy(reminderDate = null, reminderTime = null) } },
                )
                MichaelFieldButton(
                    text = (form.reminderTime ?: DEFAULT_TIME).format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)),
                    label = stringResource(R.string.tasks_editor_reminder_time),
                    onClick = { pickingTime = true },
                    tone = toneOf(message),
                )
            }
            if (state.task?.reminderSent == true && date == null) {
                MichaelText(stringResource(R.string.tasks_editor_reminder_sent), MichaelTextStyle.Caption, colors.muted)
            }
            MichaelText(stringResource(R.string.tasks_editor_reminder_zone, state.timeZone), MichaelTextStyle.Caption, colors.faint)
        }
    }
    if (pickingDate) {
        MichaelDatePickerDialog(form.reminderDate ?: LocalDate.now(), { value -> edit { it.copy(reminderDate = value) } }) {
            pickingDate =
                false
        }
    }
    if (pickingTime) {
        MichaelTimePickerDialog(form.reminderTime ?: DEFAULT_TIME, stringResource(R.string.tasks_editor_reminder_time), { value ->
            edit { it.copy(reminderTime = value) }
        }) { pickingTime = false }
    }
}

@Composable
private fun presetTitle(
    preset: RepeatDraft.Preset,
    due: LocalDate?,
): String =
    when (preset) {
        RepeatDraft.Preset.None -> {
            stringResource(R.string.tasks_repeat_none)
        }

        RepeatDraft.Preset.Daily -> {
            stringResource(R.string.tasks_repeat_daily)
        }

        RepeatDraft.Preset.Weekdays -> {
            stringResource(R.string.tasks_repeat_weekdays)
        }

        RepeatDraft.Preset.Weekly -> {
            due?.let { stringResource(R.string.tasks_repeat_weekly_on, weekdayName(it.dayOfWeek.value)) }
                ?: stringResource(R.string.tasks_repeat_weekly)
        }

        RepeatDraft.Preset.Monthly -> {
            due?.let { stringResource(R.string.tasks_repeat_monthly_on, it.dayOfMonth) }
                ?: stringResource(R.string.tasks_repeat_monthly)
        }

        RepeatDraft.Preset.Custom -> {
            stringResource(R.string.tasks_repeat_custom)
        }
    }

@Composable
private fun unitTitle(frequency: RecurrenceFrequency): String =
    stringResource(
        when (frequency) {
            RecurrenceFrequency.Daily, RecurrenceFrequency.Unknown -> R.string.tasks_repeat_unit_days
            RecurrenceFrequency.Weekly -> R.string.tasks_repeat_unit_weeks
            RecurrenceFrequency.Monthly -> R.string.tasks_repeat_unit_months
        },
    )

private val DEFAULT_TIME: LocalTime = LocalTime.of(9, 0)
