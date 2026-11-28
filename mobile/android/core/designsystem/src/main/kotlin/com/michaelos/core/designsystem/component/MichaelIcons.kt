package com.michaelos.core.designsystem.component

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

/** Line icons from the mocks' SVGs, on a 24 unit grid. Tint them where they are drawn. */
object MichaelIcons {
    val myDay =
        lineIcon("M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4")
    val tasks = lineIcon("M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2")
    val calendar = lineIcon("M6.5 5h11a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3zM3.5 10h17M8 3v4M16 3v4")
    val more = lineIcon("M5 12h.01M12 12h.01M19 12h.01", strokeWidth = DOT)
    val chevronLeft = lineIcon("M15 6l-6 6 6 6")
    val chevronRight = lineIcon("M9 6l6 6-6 6")
    val clock = lineIcon("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3 2")
    val habits = lineIcon("M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3")
    val goals = lineIcon("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10M12 12h.01")
    val review = lineIcon("M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11")
    val settings = lineIcon("M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4")
    val history = lineIcon("M4 12a8 8 0 1 0 2.6-5.9M4 5v4h4M12 8v4l3 2")
    val compose = lineIcon("M12 20h8M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z")
    val send = lineIcon("M12 19V5M6 11l6-6 6 6", strokeWidth = 2.25f)
    val check = lineIcon("M5 12l5 5 9-10", strokeWidth = 2.5f)
    val clear = lineIcon("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M9 9l6 6M15 9l-6 6")
    val choose = lineIcon("M8 9l4-4 4 4M8 15l4 4 4-4")
    val plus = lineIcon("M12 5v14M5 12h14", strokeWidth = 2.25f)
    val arrowRight = lineIcon("M5 12h14M13 6l6 6-6 6", strokeWidth = 2f)
    val filter = lineIcon("M4 7h16M7 12h10M10 17h4")
    val repeat = lineIcon("M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3")
    val globe = lineIcon("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18")
    val chevronUp = lineIcon("M6 15l6-6 6 6")
    val bell = lineIcon("M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0")
    internal val wifiOff = lineIcon("M3 9a14 14 0 0 1 18 0M6.5 12.5a9 9 0 0 1 11 0M10 16a4 4 0 0 1 4 0M4 4l16 16", strokeWidth = 2f)
    internal val alert = lineIcon("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 8v5M12 16.5v.01", strokeWidth = 2f)
}

private const val ICON_GRID = 24f
private const val LINE = 1.75f
private const val DOT = 2.8f

private fun lineIcon(
    path: String,
    strokeWidth: Float = LINE,
): ImageVector =
    ImageVector
        .Builder(defaultWidth = ICON_GRID.dp, defaultHeight = ICON_GRID.dp, viewportWidth = ICON_GRID, viewportHeight = ICON_GRID)
        .addPath(
            pathData = PathParser().parsePathString(path).toNodes(),
            stroke = SolidColor(Color.Black),
            strokeLineWidth = strokeWidth,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
        ).build()
