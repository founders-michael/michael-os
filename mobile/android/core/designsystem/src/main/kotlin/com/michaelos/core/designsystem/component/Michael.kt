package com.michaelos.core.designsystem.component

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.michaelos.core.designsystem.theme.MichaelEffects
import com.michaelos.core.designsystem.theme.MichaelMotion
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelTheme
import kotlin.math.PI
import kotlin.math.cos

enum class MichaelOrbActivity { Idle, Thinking }

enum class MichaelOrbSize(internal val diameter: Dp) {
    Small(MichaelSize.orbSmall),
    Large(MichaelSize.orbLarge),
}

// Scale ranges from ux-motion.md (breathe) and michael-theme.css (ring); they are shape, not timing.
private const val BREATHE_SCALE = 0.045f
private const val RING_START = 0.92f
private const val RING_END = 1.75f
private const val RING_OPACITY = 0.55f

// The second ring trails the first by half a period.
private const val RING_STAGGER = 0.5f

// CSS sizes a circle gradient to the farthest corner: from (34%, 28%) that is 0.977 of the diameter.
private const val ORB_HIGHLIGHT_X = 0.34f
private const val ORB_HIGHLIGHT_Y = 0.28f
private const val ORB_GRADIENT_RADIUS = 0.977f

@Composable
fun MichaelOrb(
    size: MichaelOrbSize,
    modifier: Modifier = Modifier,
    activity: MichaelOrbActivity = MichaelOrbActivity.Idle,
) {
    val dark = MichaelTheme.isDark
    val still = MichaelTheme.reduceMotion
    val thinking = activity == MichaelOrbActivity.Thinking
    val breathePeriod = if (thinking) MichaelMotion.ORB_THINKING_BREATHE_MS else MichaelMotion.orbBreatheMs.pick(dark)
    val breathe by rememberLoop(breathePeriod, still)
    val ring by rememberLoop(MichaelMotion.ORB_RING_MS, still)
    val accent = MichaelTheme.colors.accent
    val stops =
        MichaelEffects.orb
            .pick(dark)
            .map { it.location to it.color }
            .toTypedArray()
    val shadows = MichaelEffects.orbShadow.pick(dark)
    Box(
        modifier = modifier.size(size.diameter).clearAndSetSemantics {},
        contentAlignment = Alignment.Center,
    ) {
        if (thinking) {
            Canvas(Modifier.size(size.diameter)) {
                val radius = this.size.minDimension / 2
                val rings = if (still) listOf(null) else listOf(ring, (ring + RING_STAGGER) % 1f)
                rings.forEach { phase ->
                    val (scale, alpha) =
                        if (phase == null) {
                            (RING_START + RING_END) / 2 to RING_OPACITY / 2
                        } else {
                            val eased = 1 - (1 - phase) * (1 - phase)
                            RING_START + (RING_END - RING_START) * eased to RING_OPACITY * (1 - eased)
                        }
                    drawCircle(accent.copy(alpha = alpha), radius = radius * scale, style = Stroke(1.dp.toPx()))
                }
            }
        }
        val swell = if (still) 0f else wave(breathe)
        Box(
            Modifier
                .size(size.diameter)
                .graphicsLayer {
                    scaleX = 1 + BREATHE_SCALE * swell
                    scaleY = scaleX
                }.michaelShadow(CircleShape, shadows)
                .drawWithCache {
                    val brush =
                        Brush.radialGradient(
                            colorStops = stops,
                            center = Offset(this.size.width * ORB_HIGHLIGHT_X, this.size.height * ORB_HIGHLIGHT_Y),
                            radius = this.size.minDimension * ORB_GRADIENT_RADIUS,
                        )
                    onDrawBehind { drawCircle(brush) }
                },
        )
    }
}

// A 0 to 1 phase that restarts every period. With animations removed it stays at 0.
@Composable
private fun rememberLoop(
    periodMs: Int,
    still: Boolean,
): State<Float> {
    if (still) return remember { mutableFloatStateOf(0f) }
    val transition = rememberInfiniteTransition(label = "loop")
    return transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(periodMs, easing = LinearEasing), RepeatMode.Restart),
        label = "phase",
    )
}

// Dot size, gap, rise and stagger from the MichaelWorking mock.
private val dot = 6.dp
private val dotGap = 2.dp
private val dotRise = 3.dp
private const val DOT_COUNT = 3
private const val DOT_STAGGER = 0.125f
private const val DOT_REST_ALPHA = 0.25f
private const val BOUNCE_PEAK = 0.4f
private const val BOUNCE_END = 0.8f
private const val SKELETON_DIP = 0.55f

@Composable
fun TypingDots(modifier: Modifier = Modifier) {
    val still = MichaelTheme.reduceMotion
    val phase by rememberLoop(MichaelMotion.TYPING_DOT_MS, still)
    val accent = MichaelTheme.colors.accent
    Row(
        modifier = modifier.height(dot + dotRise).clearAndSetSemantics {},
        horizontalArrangement = Arrangement.spacedBy(dotGap),
        verticalAlignment = Alignment.Bottom,
    ) {
        repeat(DOT_COUNT) { index ->
            val lift = if (still) 0.5f else bounce((phase - index * DOT_STAGGER + 1f) % 1f)
            Box(
                Modifier
                    .graphicsLayer {
                        translationY = -dotRise.toPx() * lift
                        alpha = DOT_REST_ALPHA + (1 - DOT_REST_ALPHA) * lift
                    }.size(dot)
                    .background(accent, CircleShape),
            )
        }
    }
}

// Rises over the first 40% of the period, falls by 80%, then rests.
private fun bounce(phase: Float): Float {
    val linear =
        when {
            phase < BOUNCE_PEAK -> phase / BOUNCE_PEAK
            phase < BOUNCE_END -> 1 - (phase - BOUNCE_PEAK) / (BOUNCE_END - BOUNCE_PEAK)
            else -> 0f
        }
    return easeInOut(linear)
}

private fun easeInOut(fraction: Float): Float = 0.5f - 0.5f * cos(PI.toFloat() * fraction)

// 0 at the start of a period, 1 at its middle, back to 0 at its end.
private fun wave(phase: Float): Float = easeInOut(2 * phase)

@Composable
fun SkeletonBlock(
    height: Dp,
    modifier: Modifier = Modifier,
    width: Dp? = null,
    cornerRadius: Dp = MichaelRadius.buttonSmall,
) {
    val still = MichaelTheme.reduceMotion
    val phase by rememberLoop(MichaelMotion.SKELETON_PULSE_MS, still)
    val track = MichaelTheme.colors.track
    Box(
        modifier =
            modifier
                .then(if (width != null) Modifier.width(width) else Modifier.fillMaxWidth())
                .height(height)
                .graphicsLayer { alpha = if (still) 1f else 1f - SKELETON_DIP * wave(phase) }
                .background(track, RoundedCornerShape(cornerRadius))
                .clearAndSetSemantics {},
    )
}
