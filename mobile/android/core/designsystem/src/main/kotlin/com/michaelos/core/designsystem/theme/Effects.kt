package com.michaelos.core.designsystem.theme

import androidx.compose.ui.graphics.Color

data class Themed<T>(val dark: T, val light: T) {
    fun pick(dark: Boolean): T = if (dark) this.dark else light
}

internal data class ColorStop(val color: Color, val location: Float)

internal data class ShadowLayer(val x: Float, val y: Float, val blur: Float, val color: Color)

internal data class RadialGlow(
    val width: Float,
    val height: Float,
    val centerX: Float,
    val centerY: Float,
    val color: Color,
    val fadeEnd: Float,
)

internal data class DotGrid(val spacing: Float, val color: Color, val radius: Float)

// Mirrors gradient and shadow in mobile/design/tokens.json; TokenDriftTest fails if they differ.
internal object MichaelEffects {
    val orb =
        Themed(
            dark =
                listOf(
                    ColorStop(Color(0xFFE6FFF5), 0f),
                    ColorStop(Color(0xFF7DFAD0), 0.16f),
                    ColorStop(Color(0xFF41F0B0), 0.34f),
                    ColorStop(Color(0xFF0F9E76), 0.58f),
                    ColorStop(Color(0xFF04261D), 0.86f),
                ),
            light =
                listOf(
                    ColorStop(Color(0xFFFFFFFF), 0f),
                    ColorStop(Color(0xFFC9F7E4), 0.22f),
                    ColorStop(Color(0xFF34D399), 0.52f),
                    ColorStop(Color(0xFF047857), 0.92f),
                ),
        )

    val aiBorder =
        Themed(
            dark =
                listOf(
                    rgba(65, 240, 176, 0.75f),
                    rgba(92, 214, 255, 0.25f),
                    rgba(255, 255, 255, 0.06f),
                    rgba(92, 214, 255, 0.25f),
                    rgba(65, 240, 176, 0.75f),
                ),
            light = listOf(Color(0xFF6EE7B7), Color(0xFFBFDBFE), Color(0xFFE3E8EE), Color(0xFF6EE7B7)),
        )

    val progress =
        Themed(
            dark = listOf(Color(0xFF41F0B0), Color(0xFF5CD6FF)),
            light = listOf(Color(0xFF10B981), Color(0xFF3B82F6)),
        )

    val pageGlows =
        Themed(
            dark =
                listOf(
                    RadialGlow(1100f, 520f, 0.72f, -0.12f, rgba(65, 240, 176, 0.13f), 0.6f),
                    RadialGlow(800f, 460f, 0.08f, -0.06f, rgba(92, 214, 255, 0.08f), 0.6f),
                ),
            light = emptyList(),
        )

    val pageDots = Themed<DotGrid?>(dark = DotGrid(22f, rgba(255, 255, 255, 0.035f), 1f), light = null)

    val cardShadow =
        Themed(
            dark = emptyList(),
            light =
                listOf(
                    ShadowLayer(0f, 1f, 2f, rgba(16, 24, 40, 0.04f)),
                    ShadowLayer(0f, 4f, 14f, rgba(16, 24, 40, 0.05f)),
                ),
        )

    val orbShadow =
        Themed(
            dark = listOf(ShadowLayer(0f, 0f, 22f, rgba(65, 240, 176, 0.5f))),
            light = listOf(ShadowLayer(0f, 8f, 20f, rgba(16, 185, 129, 0.28f))),
        )

    val aiShadow =
        Themed(
            dark = listOf(ShadowLayer(0f, 0f, 50f, rgba(65, 240, 176, 0.07f))),
            light =
                listOf(
                    ShadowLayer(0f, 1f, 2f, rgba(16, 24, 40, 0.04f)),
                    ShadowLayer(0f, 8f, 24f, rgba(16, 185, 129, 0.08f)),
                ),
        )
}
