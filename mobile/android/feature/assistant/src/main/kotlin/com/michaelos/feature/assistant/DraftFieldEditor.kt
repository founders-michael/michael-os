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
import com.michaelos.core.designsystem.component.MichaelIcons
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
            FieldTone.Error
        } else if (missing) {
            FieldTone.Missing
        } else {
            FieldTone.Plain
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
                FieldTone.Error -> colors.danger
                FieldTone.Missing -> colors.warn
                FieldTone.Plain -> colors.muted
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
    tone: FieldTone,
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

internal enum class FieldTone { Plain, Missing, Error }

/** The look of a field on a draft card: dashed-warn while a required value is missing, red when refused. */
@Composable
private fun Modifier.fieldFrame(tone: FieldTone): Modifier {
    val colors = MichaelTheme.colors
    val shape = RoundedCornerShape(MichaelRadius.field)
    val border =
        when (tone) {
            FieldTone.Plain -> colors.border2
            FieldTone.Missing -> colors.warn
            FieldTone.Error -> colors.danger
        }
    return defaultMinSize(minHeight = MichaelSize.field)
        .fillMaxWidth()
        .background(colors.solid, shape)
        .border(BorderStroke(1.dp, border), shape)
        .padding(horizontal = MichaelSpace.md, vertical = MichaelSpace.sm)
}

@Composable
private fun TextInput(
    value: String,
    label: String,
    tone: FieldTone,
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
        modifier = Modifier.semantics { contentDescription = label }.fieldFrame(tone),
    )
}

@Composable
private fun NumberInput(
    value: Int?,
    label: String,
    input: DraftField.Input.Number,
    tone: FieldTone,
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
            modifier = Modifier.weight(1f).semantics { contentDescription = label }.fieldFrame(tone),
        )
        input.unit?.let { MichaelText(stringResource(it), MichaelTextStyle.Label, colors.muted) }
    }
}

@Composable
private fun ChoiceInput(
    value: String,
    label: String,
    options: List<DraftOption>,
    tone: FieldTone,
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateInput(
    value: LocalDate?,
    label: String,
    required: Boolean,
    tone: FieldTone,
    enabled: Boolean,
    timeZone: String,
    onChange: (DraftValue?) -> Unit,
) {
    var picking by remember { mutableStateOf(false) }
    val text = value?.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM)) ?: stringResource(R.string.draft_add_date)
    FieldButton(text, label, tone, enabled, { picking = true }, onClear = if (!required && value != null) ({ onChange(null) }) else null)
    if (picking) {
        // The picker counts days as UTC midnights, so a calendar date round-trips through it unchanged.
        val start = value ?: StartingValues.today(timeZone)
        val state = rememberDatePickerState(initialSelectedDateMillis = start.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton(onClick = {
                    picking = false
                    state.selectedDateMillis?.let {
                        onChange(
                            DraftValue.Text(
                                Instant
                                    .ofEpochMilli(it)
                                    .atZone(ZoneOffset.UTC)
                                    .toLocalDate()
                                    .toString(),
                            ),
                        )
                    }
                }) { Text(stringResource(R.string.history_rename_save)) }
            },
            dismissButton = { TextButton(onClick = { picking = false }) { Text(stringResource(R.string.history_cancel)) } },
        ) { DatePicker(state) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TimeInput(
    value: LocalTime?,
    label: String,
    required: Boolean,
    tone: FieldTone,
    enabled: Boolean,
    onChange: (DraftValue?) -> Unit,
) {
    var picking by remember { mutableStateOf(false) }
    val text = value?.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)) ?: stringResource(R.string.draft_add_time)
    FieldButton(text, label, tone, enabled, { picking = true }, onClear = if (!required && value != null) ({ onChange(null) }) else null)
    if (picking) {
        val start = value ?: StartingValues.TIME
        val state = rememberTimePickerState(initialHour = start.hour, initialMinute = start.minute)
        TimePickerDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton(onClick = {
                    picking = false
                    onChange(DraftValue.Text(LocalTime.of(state.hour, state.minute).format(StartingValues.HH_MM)))
                }) { Text(stringResource(R.string.history_rename_save)) }
            },
            dismissButton = { TextButton(onClick = { picking = false }) { Text(stringResource(R.string.history_cancel)) } },
            title = { Text(label) },
        ) { TimePicker(state) }
    }
}

@Composable
private fun FieldButton(
    text: String,
    label: String,
    tone: FieldTone,
    enabled: Boolean,
    onClick: () -> Unit,
    onClear: (() -> Unit)? = null,
    trailing: androidx.compose.ui.graphics.vector.ImageVector? = null,
) {
    val colors = MichaelTheme.colors
    Row(
        modifier =
            Modifier
                .clickable(enabled = enabled, role = Role.Button, onClickLabel = label, onClick = onClick)
                .semantics { contentDescription = "$label, $text" }
                .fieldFrame(tone),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MichaelText(text, MichaelTextStyle.Body, colors.text, modifier = Modifier.weight(1f))
        trailing?.let { Image(it, null, Modifier.size(MichaelSize.check), colorFilter = ColorFilter.tint(colors.muted)) }
        if (onClear != null && enabled) {
            val clear = stringResource(R.string.draft_clear, label)
            Image(
                MichaelIcons.clear,
                contentDescription = clear,
                modifier = Modifier.size(MichaelSize.checkTouch).clickable(role = Role.Button, onClick = onClear).padding(MichaelSpace.sm),
                colorFilter = ColorFilter.tint(colors.faint),
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun WeekdayInput(
    selected: List<Int>,
    enabled: Boolean,
    onChange: (List<Int>) -> Unit,
) {
    val colors = MichaelTheme.colors
    val locale = LocalConfiguration.current.locales[0]
    FlowRow(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm), verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        DayOfWeek.entries.forEach { day ->
            val on = day.value in selected
            val shape = RoundedCornerShape(MichaelRadius.pill)
            Box(
                modifier =
                    Modifier
                        .defaultMinSize(minWidth = MichaelSize.checkTouch, minHeight = MichaelSize.checkTouch)
                        .background(if (on) colors.fill else colors.solid, shape)
                        .border(1.dp, if (on) colors.fill else colors.border2, shape)
                        .clickable(enabled = enabled, role = Role.Checkbox) {
                            onChange(if (on) selected - day.value else (selected + day.value).sorted())
                        }.semantics {
                            this.selected = on
                            contentDescription = day.getDisplayName(TextStyle.FULL, locale)
                        }.padding(horizontal = MichaelSpace.md),
                contentAlignment = Alignment.Center,
            ) {
                MichaelText(
                    day.getDisplayName(TextStyle.SHORT, locale),
                    MichaelTextStyle.Label,
                    if (on) colors.onfill else colors.text,
                )
            }
        }
    }
}

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
