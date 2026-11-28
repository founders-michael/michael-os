package com.michaelos.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/** A wall-clock time; tapping it opens the system time picker in the device's 12 or 24 hour style. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MichaelTimeRow(
    label: String,
    time: LocalTime,
    doneLabel: String,
    cancelLabel: String,
    error: String? = null,
    onChange: (LocalTime) -> Unit,
) {
    val colors = MichaelTheme.colors
    var picking by rememberSaveable { mutableStateOf(false) }
    val shown = time.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT))
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = MichaelSize.field)
                    .clickable(role = Role.Button, onClickLabel = label) { picking = true }
                    .semantics(mergeDescendants = true) {},
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MichaelText(label, MichaelTextStyle.Body, colors.text, Modifier.weight(1f))
            MichaelText(
                shown,
                MichaelTextStyle.Body,
                colors.text,
                Modifier
                    .background(
                        colors.raise,
                        RoundedCornerShape(MichaelRadius.pill),
                    ).padding(horizontal = MichaelSpace.md, vertical = MichaelSpace.sm),
            )
        }
        if (error != null) MichaelText(error, MichaelTextStyle.Caption, colors.danger)
    }
    if (picking) {
        val is24Hour =
            android.text.format.DateFormat
                .is24HourFormat(LocalContext.current)
        val picker = rememberTimePickerState(time.hour, time.minute, is24Hour)
        AlertDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton({
                    onChange(LocalTime.of(picker.hour, picker.minute))
                    picking = false
                }) { MichaelText(doneLabel, MichaelTextStyle.Button, colors.atext) }
            },
            dismissButton = {
                TextButton(
                    { picking = false },
                ) { MichaelText(cancelLabel, MichaelTextStyle.Button, colors.muted) }
            },
            title = { MichaelText(label, MichaelTextStyle.Heading, colors.text) },
            text = { TimePicker(picker) },
            containerColor = colors.solid,
        )
    }
}

/** Every region zone the phone knows, searchable by name. The server accepts any IANA zone. */
@Composable
fun MichaelTimeZonePicker(
    selected: String,
    title: String,
    searchLabel: String,
    cancelLabel: String,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val colors = MichaelTheme.colors
    var query by rememberSaveable { mutableStateOf("") }
    // "SystemV/…" and bare abbreviations are legacy aliases nobody would pick.
    val zones = remember { ZoneId.getAvailableZoneIds().filter { '/' in it && !it.startsWith("SystemV") }.sorted() }
    val shown = zones.filter { it.replace('_', ' ').contains(query.trim(), ignoreCase = true) }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        MichaelBackground(Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier.windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = MichaelSpace.screenGutter),
                verticalArrangement = Arrangement.spacedBy(MichaelSpace.md),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    MichaelText(
                        title,
                        MichaelTextStyle.Title,
                        colors.text,
                        Modifier.weight(1f).semantics { heading() },
                    )
                    MichaelButton(cancelLabel, onDismiss, style = MichaelButtonStyle.Ghost)
                }
                MichaelTextField(searchLabel, query, { query = it })
                LazyColumn {
                    items(shown, key = { it }) { zone ->
                        Row(
                            modifier =
                                Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = MichaelSize.checkTouch)
                                    .selectable(selected = zone == selected, role = Role.RadioButton) { onSelect(zone) },
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            MichaelText(
                                zone.replace('_', ' '),
                                MichaelTextStyle.Body,
                                if (zone ==
                                    selected
                                ) {
                                    colors.atext
                                } else {
                                    colors.text
                                },
                                Modifier.weight(1f),
                            )
                            MichaelText(michaelGmtOffset(zone), MichaelTextStyle.Label, colors.muted)
                        }
                    }
                }
            }
        }
    }
}

/** "GMT+5:30" for a zone, at the current instant. */
fun michaelGmtOffset(zone: String): String {
    val seconds =
        runCatching {
            ZoneId
                .of(zone)
                .rules
                .getOffset(Instant.now())
                .totalSeconds
        }.getOrDefault(0)
    val sign = if (seconds < 0) "-" else "+"
    val hours = kotlin.math.abs(seconds) / SECONDS_PER_HOUR
    val minutes = kotlin.math.abs(seconds) % SECONDS_PER_HOUR / SECONDS_PER_MINUTE
    return if (minutes == 0) "GMT$sign$hours" else "GMT$sign$hours:%02d".format(minutes)
}

private const val SECONDS_PER_HOUR = 3_600
private const val SECONDS_PER_MINUTE = 60
