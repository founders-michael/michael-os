package com.michaelos.core.designsystem.theme

import androidx.compose.ui.unit.dp

object MichaelSpace {
    val xs = 4.dp
    val sm = 8.dp
    val md = 12.dp
    val lg = 16.dp
    val xl = 24.dp
    val xxl = 32.dp
    val screenGutter = 16.dp
    val cardPadding = 16.dp
}

object MichaelRadius {
    val card = 18.dp
    val ai = 20.dp
    val button = 12.dp
    val buttonSmall = 10.dp
    val field = 12.dp
    val stat = 14.dp
    val pill = 999.dp

    // Top start, top end, bottom end, bottom start, as CSS lists them.
    val bubble = listOf(16.dp, 16.dp, 4.dp, 16.dp)
}

object MichaelSize {
    val button = 48.dp
    val buttonSmall = 36.dp
    val field = 48.dp
    val chip = 28.dp
    val check = 24.dp
    val checkTouch = 44.dp
    val tabBar = 56.dp
    val orbSmall = 28.dp
    val orbLarge = 96.dp
    val progressTrack = 8.dp
}

object MichaelMotion {
    val orbBreatheMs = Themed(dark = 4500, light = 6000)
    const val ORB_RING_MS = 3600
    const val AI_BORDER_FLOW_MS = 7000
    const val TYPING_DOT_MS = 1200
    const val PRESS_MS = 180
    const val ORB_THINKING_BREATHE_MS = 2400
    const val CHECK_MS = 220
    const val PROGRESS_MS = 400
    const val SKELETON_PULSE_MS = 1400
}
