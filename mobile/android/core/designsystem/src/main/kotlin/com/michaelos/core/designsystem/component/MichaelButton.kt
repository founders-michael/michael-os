package com.michaelos.core.designsystem.component

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.michaelos.core.designsystem.theme.MichaelColors
import com.michaelos.core.designsystem.theme.MichaelMotion
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme

enum class MichaelButtonStyle {
    Primary,
    Secondary,
    Ghost,
    Destructive,
    ;

    internal fun colors(colors: MichaelColors): Pair<Color, Color> =
        when (this) {
            Primary -> colors.onfill to colors.fill
            Secondary -> colors.text to colors.raise
            Ghost -> colors.muted to Color.Transparent
            Destructive -> colors.danger to Color.Transparent
        }
}

private const val PRESSED_SCALE = 0.97f
private const val PRESSED_ALPHA = 0.85f

@Composable
fun MichaelButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    style: MichaelButtonStyle = MichaelButtonStyle.Primary,
    enabled: Boolean = true,
) {
    val colors = MichaelTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val reduceMotion = MichaelTheme.reduceMotion
    val scale by animateFloatAsState(
        targetValue = if (pressed && !reduceMotion) PRESSED_SCALE else 1f,
        animationSpec = if (pressed) tween(MichaelMotion.PRESS_MS) else spring(),
        label = "pressScale",
    )
    val shape = RoundedCornerShape(MichaelRadius.button)
    val (foreground, background) = if (enabled) style.colors(colors) else colors.faint to Color.Transparent
    val bordered = !enabled || style == MichaelButtonStyle.Secondary
    val horizontal =
        if (style == MichaelButtonStyle.Primary || style == MichaelButtonStyle.Secondary) MichaelSpace.lg else MichaelSpace.md
    Box(
        modifier =
            modifier
                .graphicsLayer {
                    scaleX = scale
                    scaleY = scale
                    alpha = if (pressed) PRESSED_ALPHA else 1f
                }.defaultMinSize(minHeight = MichaelSize.button)
                .background(background, shape)
                .then(if (bordered) Modifier.border(1.dp, colors.border2, shape) else Modifier)
                .clickable(
                    interactionSource = interaction,
                    indication = null,
                    enabled = enabled,
                    role = Role.Button,
                    onClick = onClick,
                ).padding(horizontal = horizontal, vertical = MichaelSpace.sm),
        contentAlignment = Alignment.Center,
    ) {
        MichaelText(text, MichaelTextStyle.Button, foreground, textAlign = TextAlign.Center)
    }
}
