package com.michaelos.core.designsystem.component

import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import com.michaelos.core.designsystem.theme.MichaelEffects
import com.michaelos.core.designsystem.theme.MichaelMotion
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelTheme

@Composable
fun MichaelProgressBar(
    value: Float,
    modifier: Modifier = Modifier,
) {
    val clamped = value.coerceIn(0f, 1f)
    val shown by animateFloatAsState(
        targetValue = clamped,
        animationSpec = if (MichaelTheme.reduceMotion) snap() else tween(MichaelMotion.PROGRESS_MS, easing = LinearOutSlowInEasing),
        label = "progress",
    )
    val track = MichaelTheme.colors.track
    val gradient = MichaelEffects.progress.pick(MichaelTheme.isDark)
    Canvas(
        modifier =
            modifier
                .fillMaxWidth()
                .height(MichaelSize.progressTrack)
                .semantics { progressBarRangeInfo = ProgressBarRangeInfo(clamped, 0f..1f) },
    ) {
        val radius = CornerRadius(size.height / 2)
        drawRoundRect(track, cornerRadius = radius)
        if (shown > 0f) {
            drawRoundRect(
                brush = Brush.horizontalGradient(gradient, endX = size.width * shown),
                size = Size(size.width * shown, size.height),
                cornerRadius = radius,
            )
        }
    }
}
