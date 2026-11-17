package com.michaelos.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme

enum class MichaelChipTone { Plain, Ai, Warn, Danger }

@Composable
fun MichaelChip(
    text: String,
    modifier: Modifier = Modifier,
    tone: MichaelChipTone = MichaelChipTone.Plain,
) {
    val colors = MichaelTheme.colors
    val shape = RoundedCornerShape(MichaelRadius.pill)
    val (foreground, background, border) =
        when (tone) {
            MichaelChipTone.Plain -> Triple(colors.muted, colors.raise, colors.border)
            MichaelChipTone.Ai -> Triple(colors.atext, colors.chip, colors.chipBorder)
            MichaelChipTone.Warn -> Triple(colors.warn, colors.warnBg, null)
            MichaelChipTone.Danger -> Triple(colors.danger, colors.dangerBg, null)
        }
    Box(
        modifier =
            modifier
                .defaultMinSize(minHeight = MichaelSize.chip)
                .background(background, shape)
                .then(if (border != null) Modifier.border(1.dp, border, shape) else Modifier)
                .padding(horizontal = MichaelSpace.md),
        contentAlignment = Alignment.Center,
    ) {
        MichaelText(text, MichaelTextStyle.Caption, foreground)
    }
}
