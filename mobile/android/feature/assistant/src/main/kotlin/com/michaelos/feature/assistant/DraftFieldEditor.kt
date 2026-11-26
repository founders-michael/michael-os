package com.michaelos.feature.assistant

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TimePickerDialog
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.michaelos.core.designsystem.component.MichaelDatePickerDialog
import com.michaelos.core.designsystem.component.MichaelFieldButton
import com.michaelos.core.designsystem.component.MichaelFieldTone
import com.michaelos.core.designsystem.component.MichaelIcons
import com.michaelos.core.designsystem.component.MichaelTimePickerDialog
import com.michaelos.core.designsystem.component.MichaelWeekdayPicker
import com.michaelos.core.designsystem.component.michaelFieldFrame
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.DraftValue
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.format.TextStyle

/** One field of a draft card. Dates and times are calendar values in the draft's time zone and are never shifted. */
@Composable
internal fun DraftFieldEditor(
    field: DraftField,
    form: DraftForm,
    missing: Boolean,
    error: String?,
    enabled: Boolean,
    onChange: (DraftValue?) -> Unit,
) {
    val colors = MichaelTheme.colors
    val label = stringResource(field.label)
    val tone =
        if (error != null) {
            MichaelFieldTone.Error
        } else if (missing) {
            MichaelFieldTone.Missing
        } else {
            MichaelFieldTone.Plain
        }
    val needed = stringResource(R.string.draft_needed_hint)
    Column(
        modifier = Modifier.semantics { if (missing) stateDescription = needed },
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs),
    ) {
        MichaelText(
            if (missing) stringResource(R.string.draft_needed, label) else label,
            MichaelTextStyle.Label,
            when (tone) {
                MichaelFieldTone.Error -> colors.danger
                MichaelFieldTone.Missing -> colors.warn
                MichaelFieldTone.Plain -> colors.muted
            },
        )
        FieldControl(field, form, label, tone, enabled, onChange)
        if (error != null) MichaelText(error, MichaelTextStyle.Caption, colors.danger)
    }
}

@Composable
private fun FieldControl(
    field: DraftField,
    form: DraftForm,
    label: String,
    tone: MichaelFieldTone,
    enabled: Boolean,
    onChange: (DraftValue?) -> Unit,
) {
    when (val input = field.input) {
        is DraftField.Input.Text -> {
            TextInput(form.text(field.name), label, tone, enabled, singleLine = true, input.maxLength, onChange)
        }

        is DraftField.Input.LongText -> {
            TextInput(
                form.text(field.name),
                label,
                tone,
                enabled,
                singleLine = false,
                input.maxLength,
                onChange,
            )
        }

        is DraftField.Input.Number -> {
            NumberInput(form.number(field.name), label, input, tone, enabled, onChange)
        }

        is DraftField.Input.Choice -> {
            ChoiceInput(form.text(field.name), label, input.options, tone, enabled, onChange)
        }

        DraftField.Input.Date -> {
            DateInput(form.date(field.name), label, field.required, tone, enabled, form.timeZone, onChange)
        }

        DraftField.Input.Time -> {
            TimeInput(form.time(field.name), label, field.required, tone, enabled, onChange)
        }

        DraftField.Input.Weekdays -> {
            WeekdayInput(form.days(field.name), enabled) { onChange(DraftValue.Days(it)) }
        }
    }
}

@Composable
private fun TextInput(
    value: String,
    label: String,
    tone: MichaelFieldTone,
    enabled: Boolean,
    singleLine: Boolean,
    maxLength: Int,
    onChange: (DraftValue?) -> Unit,
) {
    val colors = MichaelTheme.colors
    BasicTextField(
        value = value,
        onValueChange = { text -> onChange(text.take(maxLength).ifEmpty { null }?.let(DraftValue::Text)) },
        enabled = enabled,
        singleLine = singleLine,
        minLines = if (singleLine) 1 else 2,
        maxLines = if (singleLine) 1 else LONG_TEXT_LINES,
        textStyle = MichaelTextStyle.Body.textStyle.copy(color = colors.text),
        cursorBrush = SolidColor(colors.accent),
        modifier = Modifier.semantics { contentDescription = label }.michaelFieldFrame(tone),
    )
}

@Composable
private fun NumberInput(
    value: Int?,
    label: String,
    input: DraftField.Input.Number,
    tone: MichaelFieldTone,
    enabled: Boolean,
    onChange: (DraftValue?) -> Unit,
) {
    val colors = MichaelTheme.colors
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        BasicTextField(
            value = value?.toString().orEmpty(),
            onValueChange = { text ->
                onChange(
                    text
                        .filter(Char::isDigit)
                        .take(NUMBER_DIGITS)
                        .toIntOrNull()
                        ?.let(DraftValue::Number),
                )
            },
            enabled = enabled,
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            textStyle = MichaelTextStyle.Body.textStyle.copy(color = colors.text),
            cursorBrush = SolidColor(colors.accent),
            modifier = Modifier.weight(1f).semantics { contentDescription = label }.michaelFieldFrame(tone),
        )
        input.unit?.let { MichaelText(stringResource(it), MichaelTextStyle.Label, colors.muted) }
    }
}

@Composable
private fun ChoiceInput(
    value: String,
    label: String,
    options: List<DraftOption>,
    tone: MichaelFieldTone,
    enabled: Boolean,
    onChange: (DraftValue?) -> Unit,
) {
    val colors = MichaelTheme.colors
    var open by remember { mutableStateOf(false) }
    Box {
        FieldButton(
            text = options.firstOrNull { it.value == value }?.let { stringResource(it.label) } ?: stringResource(R.string.draft_choose),
            label = label,
            tone = tone,
            enabled = enabled,
            onClick = { open = true },
            trailing = MichaelIcons.choose,
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { MichaelText(stringResource(option.label), MichaelTextStyle.Body, colors.text) },
                    onClick = {
                        open = false
                        onChange(DraftValue.Text(option.value))
                    },
                )
            }
        }
    }
}

@Composable
private fun DateInput(
    value: LocalDate?,
    label: String,
    required: Boolean,
    tone: MichaelFieldTone,
    enabled: Boolean,
    timeZone: String,
    onChange: (DraftValue?) -> Unit,
) {
    var picking by remember { mutableStateOf(false) }
    val text = value?.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)) ?: stringResource(R.string.draft_add_date)
    FieldButton(text, label, tone, enabled, { picking = true }, onClear = if (!required && value != null) ({ onChange(null) }) else null)
    if (picking) {
        MichaelDatePickerDialog(
            initial = value ?: StartingValues.today(timeZone),
            onPick = { onChange(DraftValue.Text(it.toString())) },
            onDismiss = { picking = false },
        )
    }
}

@Composable
private fun TimeInput(
    value: LocalTime?,
    label: String,
    required: Boolean,
    tone: MichaelFieldTone,
    enabled: Boolean,
    onChange: (DraftValue?) -> Unit,
) {
    var picking by remember { mutableStateOf(false) }
    val text = value?.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)) ?: stringResource(R.string.draft_add_time)
    FieldButton(text, label, tone, enabled, { picking = true }, onClear = if (!required && value != null) ({ onChange(null) }) else null)
    if (picking) {
        MichaelTimePickerDialog(
            initial = value ?: StartingValues.TIME,
            title = label,
            onPick = { onChange(DraftValue.Text(it.format(StartingValues.HH_MM))) },
            onDismiss = { picking = false },
        )
    }
}

@Composable
private fun FieldButton(
    text: String,
    label: String,
    tone: MichaelFieldTone,
    enabled: Boolean,
    onClick: () -> Unit,
    onClear: (() -> Unit)? = null,
    trailing: androidx.compose.ui.graphics.vector.ImageVector? = null,
) = MichaelFieldButton(
    text = text,
    label = label,
    onClick = onClick,
    tone = tone,
    enabled = enabled,
    clearLabel = stringResource(R.string.draft_clear, label),
    onClear = onClear,
    trailing = trailing,
)

@Composable
private fun WeekdayInput(
    selected: List<Int>,
    enabled: Boolean,
    onChange: (List<Int>) -> Unit,
) = MichaelWeekdayPicker(selected.toSet(), { onChange(it.sorted()) }, enabled = enabled)

/** Only starting values for a picker the user then sets: the server's date rules everything else. */
private object StartingValues {
    val TIME: LocalTime = LocalTime.of(9, 0)
    val HH_MM: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm")

    fun today(zone: String): LocalDate =
        try {
            LocalDate.now(java.time.ZoneId.of(zone))
        } catch (_: java.time.DateTimeException) {
            LocalDate.now(ZoneOffset.UTC)
        }
}

private const val LONG_TEXT_LINES = 6
private const val NUMBER_DIGITS = 5
