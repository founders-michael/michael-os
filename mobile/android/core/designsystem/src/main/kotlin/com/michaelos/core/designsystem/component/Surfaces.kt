package com.michaelos.core.designsystem.component

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shader
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SweepGradientShader
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.shadow.Shadow
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import com.michaelos.core.designsystem.theme.MichaelEffects
import com.michaelos.core.designsystem.theme.MichaelMotion
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.designsystem.theme.ShadowLayer
import androidx.compose.ui.draw.dropShadow as composeDropShadow

internal fun Modifier.michaelShadow(
    shape: Shape,
    layers: List<ShadowLayer>,
): Modifier =
    layers.fold(this) { modifier, layer ->
        modifier.composeDropShadow(
            shape,
            Shadow(radius = layer.blur.dp, color = layer.color, offset = DpOffset(layer.x.dp, layer.y.dp)),
        )
    }

@Composable
fun MichaelCard(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    val shape = RoundedCornerShape(MichaelRadius.card)
    val colors = MichaelTheme.colors
    Box(
        modifier =
            modifier
                .fillMaxWidth()
                .michaelShadow(shape, MichaelEffects.cardShadow.pick(MichaelTheme.isDark))
                .background(colors.surface, shape)
                .border(1.dp, colors.border, shape)
                .padding(MichaelSpace.cardPadding),
        content = content,
    )
}

@Composable
fun AICard(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    val shape = RoundedCornerShape(MichaelRadius.ai)
    val dark = MichaelTheme.isDark
    val borderColors = MichaelEffects.aiBorder.pick(dark)
    val angle = rememberFlowAngle(still = MichaelTheme.reduceMotion)
    Box(
        modifier =
            modifier
                .fillMaxWidth()
                .michaelShadow(shape, MichaelEffects.aiShadow.pick(dark))
                .background(MichaelTheme.colors.aiSurface, shape)
                .drawWithCache {
                    val stroke = 1.dp.toPx()
                    val inner = Size(size.width - stroke, size.height - stroke)
                    val outline = shape.createOutline(inner, layoutDirection, this)
                    onDrawWithContent {
                        drawContent()
                        translate(stroke / 2, stroke / 2) {
                            drawOutline(outline, RotatingSweep(borderColors, angle.value), style = Stroke(stroke))
                        }
                    }
                }.padding(MichaelSpace.cardPadding),
        content = content,
    )
}

// The web drifts a linear gradient sideways; on a phone-sized card a sweep gradient turning once per
// period reads as the same drift along the border and loops without a seam.
@Composable
private fun rememberFlowAngle(still: Boolean): State<Float> {
    if (still) return remember { mutableFloatStateOf(0f) }
    val transition = rememberInfiniteTransition(label = "aiBorder")
    return transition.animateFloat(
        initialValue = 0f,
        targetValue = FULL_TURN,
        animationSpec = infiniteRepeatable(tween(MichaelMotion.AI_BORDER_FLOW_MS, easing = LinearEasing), RepeatMode.Restart),
        label = "aiBorderAngle",
    )
}

private const val FULL_TURN = 360f

private class RotatingSweep(
    private val colors: List<Color>,
    private val degrees: Float,
) : ShaderBrush() {
    override fun createShader(size: Size): Shader {
        val center = Offset(size.width / 2, size.height / 2)
        return SweepGradientShader(center, colors).apply {
            setLocalMatrix(android.graphics.Matrix().apply { setRotate(degrees, center.x, center.y) })
        }
    }
}
