package com.michaelos.feature.onboarding

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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.michaelos.core.designsystem.component.MichaelBackground
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelTextField
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import java.time.ZoneId

/** Every region zone the phone knows, searchable by name. The server accepts any IANA zone. */
@Composable
internal fun TimeZonePicker(
    selected: String,
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
                        stringResource(R.string.onboarding_zone_label),
                        MichaelTextStyle.Title,
                        colors.text,
                        Modifier.weight(1f).semantics { heading() },
                    )
                    MichaelButton(stringResource(R.string.onboarding_cancel), onDismiss, style = MichaelButtonStyle.Ghost)
                }
                MichaelTextField(stringResource(R.string.onboarding_zone_search), query, { query = it })
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
                            MichaelText(gmtOffset(zone), MichaelTextStyle.Label, colors.muted)
                        }
                    }
                }
            }
        }
    }
}
