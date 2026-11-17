package com.michaelos.core.designsystem.component

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.michaelos.core.designsystem.R
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme

private const val EMPTY_RING_SCALE = 1.25f

@Composable
fun EmptyStateView(
    title: String,
    message: String,
    actionText: String,
    onAction: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MichaelTheme.colors
    Column(
        modifier = modifier.fillMaxWidth().padding(horizontal = MichaelSpace.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.xl),
    ) {
        Box(
            modifier =
                Modifier
                    .size(MichaelSize.orbLarge * EMPTY_RING_SCALE)
                    .border(1.dp, colors.chipBorder, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            MichaelOrb(MichaelOrbSize.Large)
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            MichaelText(
                title,
                MichaelTextStyle.Title,
                colors.text,
                modifier = Modifier.semantics { heading() },
                textAlign = TextAlign.Center,
            )
            MichaelText(message, MichaelTextStyle.Body, colors.muted, textAlign = TextAlign.Center)
        }
        MichaelButton(actionText, onAction, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
fun FailureStateView(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MichaelTheme.colors
    Column(
        modifier = modifier.fillMaxWidth().padding(horizontal = MichaelSpace.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg),
    ) {
        Image(
            imageVector = alertIcon,
            contentDescription = null,
            colorFilter = ColorFilter.tint(colors.danger),
            modifier = Modifier.size(MichaelSize.orbSmall),
        )
        MichaelText(message, MichaelTextStyle.Body, colors.text, textAlign = TextAlign.Center)
        MichaelButton(
            stringResource(R.string.state_try_again),
            onRetry,
            modifier = Modifier.fillMaxWidth(),
            style = MichaelButtonStyle.Secondary,
        )
    }
}

// Past this font scale the message needs the full width, so Retry moves below it.
private const val STACK_FONT_SCALE = 1.5f

@Composable
fun OfflineBanner(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = MichaelTheme.colors
    val shape = RoundedCornerShape(MichaelRadius.stat)
    val stacked = LocalDensity.current.fontScale >= STACK_FONT_SCALE
    val body: @Composable () -> Unit = {
        Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm), verticalAlignment = Alignment.CenterVertically) {
            Image(
                imageVector = wifiOffIcon,
                contentDescription = null,
                colorFilter = ColorFilter.tint(colors.warn),
                modifier = Modifier.size(MichaelSpace.lg + MichaelSpace.xs / 2),
            )
            MichaelText(message, MichaelTextStyle.Label, colors.warn, modifier = Modifier.weight(1f, fill = !stacked))
        }
    }
    val retry: @Composable () -> Unit = {
        Box(
            modifier =
                Modifier
                    .minimumInteractiveComponentSize()
                    .clickable(role = Role.Button, onClick = onRetry)
                    .padding(horizontal = MichaelSpace.md),
            contentAlignment = Alignment.Center,
        ) {
            MichaelText(
                stringResource(R.string.state_retry),
                MichaelTextStyle.Button,
                colors.warn,
                textDecoration = TextDecoration.Underline,
                maxLines = 1,
            )
        }
    }
    val container =
        modifier
            .fillMaxWidth()
            .background(colors.warnBg, shape)
            .padding(start = MichaelSpace.md, top = MichaelSpace.xs, bottom = MichaelSpace.xs)
    if (stacked) {
        Column(modifier = container.padding(top = MichaelSpace.sm)) {
            body()
            retry()
        }
    } else {
        Row(modifier = container.defaultMinSize(minHeight = MichaelSize.checkTouch), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { body() }
            retry()
        }
    }
}

// Line icons from the mocks' SVG, drawn on a 24-unit grid.
private val wifiOffIcon = lineIcon("M3 9a14 14 0 0 1 18 0M6.5 12.5a9 9 0 0 1 11 0M10 16a4 4 0 0 1 4 0M4 4l16 16")
private val alertIcon = lineIcon("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 8v5M12 16.5v.01")

private const val ICON_GRID = 24f

private fun lineIcon(path: String): ImageVector =
    ImageVector
        .Builder(defaultWidth = ICON_GRID.dp, defaultHeight = ICON_GRID.dp, viewportWidth = ICON_GRID, viewportHeight = ICON_GRID)
        .addPath(
            pathData = PathParser().parsePathString(path).toNodes(),
            stroke = SolidColor(Color.Black),
            strokeLineWidth = 2f,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
        ).build()

/** A failure that belongs to the form above it, such as a refused sign-in. Screen readers announce it. */
@Composable
fun ErrorBanner(
    message: String,
    modifier: Modifier = Modifier,
) {
    val colors = MichaelTheme.colors
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .background(colors.dangerBg, RoundedCornerShape(MichaelRadius.field))
                .padding(MichaelSpace.md)
                .semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Assertive },
        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
    ) {
        MichaelText("!", MichaelTextStyle.Label, colors.danger, Modifier.clearAndSetSemantics {})
        MichaelText(message, MichaelTextStyle.Label, colors.danger)
    }
}
