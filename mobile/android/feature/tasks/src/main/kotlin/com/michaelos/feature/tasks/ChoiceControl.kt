package com.michaelos.feature.tasks

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalDensity
import com.michaelos.core.designsystem.component.MichaelFieldButton
import com.michaelos.core.designsystem.component.MichaelIcons
import com.michaelos.core.designsystem.component.MichaelSegmentedControl

/** Segments, or a menu at the largest font scales, where the segments cut their labels. */
@Composable
internal fun <T> ChoiceControl(
    options: List<T>,
    selected: T,
    label: String,
    onSelect: (T) -> Unit,
    title: @Composable (T) -> String,
    enabled: Boolean = true,
) {
    if (LocalDensity.current.fontScale < LARGE_FONT_SCALE) {
        MichaelSegmentedControl(options = options, selected = selected, onSelect = { if (enabled) onSelect(it) }, title = title)
        return
    }
    var open by remember { mutableStateOf(false) }
    Box {
        MichaelFieldButton(title(selected), label, { open = true }, enabled = enabled, trailing = MichaelIcons.choose)
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { option ->
                DropdownMenuItem(text = { Text(title(option)) }, onClick = {
                    open = false
                    onSelect(option)
                })
            }
        }
    }
}

private const val LARGE_FONT_SCALE = 1.5f
