package com.michaelos.core.designsystem.component

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.michaelos.core.designsystem.theme.MichaelEffects
import com.michaelos.core.designsystem.theme.MichaelMotion
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme

// The visible check is 24dp; minimumInteractiveComponentSize makes the target Android's 48dp.
@Composable
fun MichaelCheck(
    checked: Boolean,
    label: String,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = MichaelTheme.colors
    val haptics = LocalHapticFeedback.current
    val reduceMotion = MichaelTheme.reduceMotion
    val progress by animateFloatAsState(
        targetValue = if (checked) 1f else 0f,
        animationSpec = tween(MichaelMotion.CHECK_MS),
        label = "check",
    )
    Canvas(
        modifier =
            modifier
                .minimumInteractiveComponentSize()
                .size(MichaelSize.check)
                .semantics { contentDescription = label }
                .alpha(if (enabled) 1f else DISABLED_ALPHA)
                .toggleable(value = checked, enabled = enabled, role = Role.Checkbox) { now ->
                    if (now) haptics.performHapticFeedback(HapticFeedbackType.ToggleOn)
                    onCheckedChange(now)
                },
    ) {
        val ring = 1.5.dp.toPx()
        drawCircle(colors.border2, radius = (size.minDimension - ring) / 2, style = Stroke(ring))
        val fillScale = if (reduceMotion) 1f else progress
        scale(fillScale) { drawCircle(colors.accent.copy(alpha = colors.accent.alpha * progress)) }
        val unit = size.width / CHECK_BOX
        val tick =
            Path().apply {
                tickPoints.forEachIndexed { index, point ->
                    if (index == 0) moveTo(point.x * unit, point.y * unit) else lineTo(point.x * unit, point.y * unit)
                }
            }
        val drawn = Path()
        val measure = PathMeasure().apply { setPath(tick, false) }
        measure.getSegment(0f, measure.length * (if (reduceMotion) 1f else progress), drawn, true)
        drawPath(
            drawn,
            colors.onAccent.copy(alpha = progress),
            style = Stroke(width = 2 * unit, cap = StrokeCap.Round, join = StrokeJoin.Round),
        )
    }
}

private const val DISABLED_ALPHA = 0.55f

// The tick from the mocks' SVG, M5 12 l5 5 9-10, in its 24-unit box.
private const val CHECK_BOX = 24f
private val tickPoints = listOf(Offset(5f, 12f), Offset(10f, 17f), Offset(19f, 7f))

@Composable
fun <T> MichaelSegmentedControl(
    options: List<T>,
    selected: T,
    onSelect: (T) -> Unit,
    title: @Composable (T) -> String,
    modifier: Modifier = Modifier,
) {
    val colors = MichaelTheme.colors
    val dark = MichaelTheme.isDark
    val outer = RoundedCornerShape(MichaelRadius.button)
    val pill = RoundedCornerShape(MichaelRadius.buttonSmall)
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .background(colors.raise, outer)
                .border(1.dp, colors.border, outer)
                .padding(horizontal = MichaelSpace.xs)
                .selectableGroup(),
        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.xs / 2),
    ) {
        options.forEach { option ->
            val isSelected = option == selected
            Segment(isSelected = isSelected, onClick = { onSelect(option) }) {
                Box(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = MichaelSize.buttonSmall)
                            .then(
                                if (isSelected) {
                                    Modifier
                                        .michaelShadow(pill, MichaelEffects.cardShadow.pick(dark))
                                        .background(colors.solid, pill)
                                        .border(1.dp, colors.border2, pill)
                                } else {
                                    Modifier
                                },
                            ).padding(horizontal = MichaelSpace.xs),
                    contentAlignment = Alignment.Center,
                ) {
                    MichaelText(
                        title(option),
                        MichaelTextStyle.Label,
                        if (isSelected) colors.text else colors.muted,
                        textAlign = TextAlign.Center,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

// The pill is buttonSmall high; the tap target is the full interactive height around it.
@Composable
private fun RowScope.Segment(
    isSelected: Boolean,
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    Box(
        modifier =
            Modifier
                .weight(1f)
                .minimumInteractiveComponentSize()
                .selectable(selected = isSelected, role = Role.Tab, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { content() }
}

// Track and knob sizes come from the NotificationSettings mock; tokens.json has no switch entry.
private val trackWidth = 46.dp
private val knobInset = 3.dp

@Composable
fun MichaelToggle(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val colors = MichaelTheme.colors
    val trackHeight = MichaelSize.chip
    val knob = trackHeight - knobInset * 2
    val knobOffset by animateDpAsState(
        targetValue = if (checked) trackWidth - knob - knobInset else knobInset,
        animationSpec = if (MichaelTheme.reduceMotion) snap() else tween(MichaelMotion.PRESS_MS),
        label = "knob",
    )
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .minimumInteractiveComponentSize()
                .toggleable(value = checked, enabled = enabled, role = Role.Switch, onValueChange = onCheckedChange)
                .alpha(if (enabled) 1f else DISABLED_ALPHA),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.md),
    ) {
        MichaelText(label, MichaelTextStyle.Body, colors.text, modifier = Modifier.weight(1f))
        Box(
            modifier =
                Modifier
                    .width(trackWidth)
                    .height(trackHeight)
                    .background(if (checked) colors.accent else colors.track, CircleShape),
            contentAlignment = Alignment.CenterStart,
        ) {
            Box(
                Modifier
                    .offset { IntOffset(knobOffset.roundToPx(), 0) }
                    .size(knob)
                    .background(colors.onfill, CircleShape),
            )
        }
    }
}

@Composable
fun StatTile(
    value: String,
    label: String,
    modifier: Modifier = Modifier,
    highlighted: Boolean = false,
) {
    val colors = MichaelTheme.colors
    val shape = RoundedCornerShape(MichaelRadius.stat)
    Column(
        modifier =
            modifier
                .background(colors.raise, shape)
                .border(1.dp, colors.border, shape)
                .padding(MichaelSpace.md)
                .semantics(mergeDescendants = true) {},
    ) {
        MichaelText(value, MichaelTextStyle.Stat, if (highlighted) colors.atext else colors.text)
        MichaelText(label, MichaelTextStyle.Caption, colors.muted)
    }
}
