package com.michaelos.core.designsystem.component

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.PointMode
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.unit.dp
import com.michaelos.core.designsystem.theme.MichaelEffects
import com.michaelos.core.designsystem.theme.MichaelTheme

@Composable
fun MichaelBackground(
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit,
) {
    val bg = MichaelTheme.colors.bg
    val dark = MichaelTheme.isDark
    val glows = MichaelEffects.pageGlows.pick(dark)
    val dots = MichaelEffects.pageDots.pick(dark)
    Box(
        modifier =
            modifier.drawBehind {
                drawRect(bg)
                // A CSS radial-gradient with an explicit width and height is an ellipse; draw a circle and squash it.
                glows.forEach { glow ->
                    val radius = glow.width.dp.toPx()
                    translate(size.width * glow.centerX, size.height * glow.centerY) {
                        scale(1f, glow.height / glow.width, pivot = Offset.Zero) {
                            drawCircle(
                                Brush.radialGradient(
                                    0f to glow.color,
                                    glow.fadeEnd to glow.color.copy(alpha = 0f),
                                    center = Offset.Zero,
                                    radius = radius,
                                ),
                                radius = radius,
                                center = Offset.Zero,
                            )
                        }
                    }
                }
                if (dots != null) {
                    val area = size
                    val spacing = dots.spacing.dp.toPx()
                    val points =
                        buildList {
                            var y = spacing / 2
                            while (y < area.height) {
                                var x = spacing / 2
                                while (x < area.width) {
                                    add(Offset(x, y))
                                    x += spacing
                                }
                                y += spacing
                            }
                        }
                    drawPoints(points, PointMode.Points, dots.color, strokeWidth = dots.radius.dp.toPx() * 2, cap = StrokeCap.Round)
                }
            },
        content = content,
    )
}
