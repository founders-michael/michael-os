package com.michaelos.core.designsystem.component

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TimePickerDialog
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.michaelos.core.designsystem.R
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.TextStyle
import java.time.temporal.WeekFields

enum class MichaelFieldTone { Plain, Missing, Error }

/** The look of an editable field: warn-bordered while a required value is missing, red when refused. */
@Composable
fun Modifier.michaelFieldFrame(tone: MichaelFieldTone = MichaelFieldTone.Plain): Modifier {
    val colors = MichaelTheme.colors
    val shape = RoundedCornerShape(MichaelRadius.field)
    val border =
        when (tone) {
            MichaelFieldTone.Plain -> colors.border2
            MichaelFieldTone.Missing -> colors.warn
            MichaelFieldTone.Error -> colors.danger
        }
    return defaultMinSize(minHeight = MichaelSize.field)
        .fillMaxWidth()
        .background(colors.solid, shape)
        .border(BorderStroke(1.dp, border), shape)
        .padding(horizontal = MichaelSpace.md, vertical = MichaelSpace.sm)
}

/** A field that opens a picker or a menu: its value as text, an optional trailing icon and an optional clear. */
@Composable
fun MichaelFieldButton(
    text: String,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tone: MichaelFieldTone = MichaelFieldTone.Plain,
    enabled: Boolean = true,
    clearLabel: String? = null,
    onClear: (() -> Unit)? = null,
    trailing: ImageVector? = null,
) {
    val colors = MichaelTheme.colors
    Row(
        modifier =
            modifier
                .clickable(enabled = enabled, role = Role.Button, onClickLabel = label, onClick = onClick)
                .semantics { contentDescription = "$label, $text" }
                .michaelFieldFrame(tone),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MichaelText(text, MichaelTextStyle.Body, colors.text, modifier = Modifier.weight(1f))
        trailing?.let { Image(it, null, Modifier.size(MichaelSize.check), colorFilter = ColorFilter.tint(colors.muted)) }
        if (onClear != null && enabled) {
            Image(
                MichaelIcons.clear,
                contentDescription = clearLabel,
                modifier = Modifier.size(MichaelSize.checkTouch).clickable(role = Role.Button, onClick = onClear).padding(MichaelSpace.sm),
                colorFilter = ColorFilter.tint(colors.faint),
            )
        }
    }
}

/** The system date picker. It counts days as UTC midnights, so a calendar date round-trips through it unchanged. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MichaelDatePickerDialog(
    initial: LocalDate,
    onPick: (LocalDate) -> Unit,
    onDismiss: () -> Unit,
) {
    val state = rememberDatePickerState(initialSelectedDateMillis = initial.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = {
                onDismiss()
                state.selectedDateMillis?.let { onPick(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) }
            }) { Text(stringResource(R.string.picker_done)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.picker_cancel)) } },
    ) { DatePicker(state) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MichaelTimePickerDialog(
    initial: LocalTime,
    title: String,
    onPick: (LocalTime) -> Unit,
    onDismiss: () -> Unit,
) {
    val state = rememberTimePickerState(initialHour = initial.hour, initialMinute = initial.minute)
    TimePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = {
                onDismiss()
                onPick(LocalTime.of(state.hour, state.minute))
            }) { Text(stringResource(R.string.picker_done)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.picker_cancel)) } },
        title = { Text(title) },
    ) { TimePicker(state) }
}

/** Days of the week as toggles, starting on the locale's first day. Days are ISO numbers, 1 for Monday. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MichaelWeekdayPicker(
    selected: Set<Int>,
    onChange: (Set<Int>) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = MichaelTheme.colors
    val locale = LocalConfiguration.current.locales[0]
    val first = WeekFields.of(locale).firstDayOfWeek
    FlowRow(
        modifier,
        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
    ) {
        List(DayOfWeek.entries.size) { first.plus(it.toLong()) }.forEach { day ->
            val on = day.value in selected
            val shape = RoundedCornerShape(MichaelRadius.pill)
            Box(
                modifier =
                    Modifier
                        .defaultMinSize(minWidth = MichaelSize.checkTouch, minHeight = MichaelSize.checkTouch)
                        .background(if (on) colors.fill else colors.solid, shape)
                        .border(1.dp, if (on) colors.fill else colors.border2, shape)
                        .clickable(enabled = enabled, role = Role.Checkbox) {
                            onChange(
                                if (on) {
                                    selected - day.value
                                } else {
                                    selected +
                                        day.value
                                },
                            )
                        }.semantics {
                            this.selected = on
                            contentDescription = day.getDisplayName(TextStyle.FULL, locale)
                        }.padding(horizontal = MichaelSpace.md),
                contentAlignment = Alignment.Center,
            ) {
                MichaelText(day.getDisplayName(TextStyle.SHORT, locale), MichaelTextStyle.Label, if (on) colors.onfill else colors.text)
            }
        }
    }
}
