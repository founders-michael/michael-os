package com.michaelos.feature.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.michaelos.core.designsystem.component.MichaelTimeRow
import com.michaelos.core.designsystem.component.michaelGmtOffset
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.DayOfWeek
import com.michaelos.core.model.PlanningStyle
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

@Composable
internal fun ZoneRow(
    zone: String,
    error: String?,
    onClick: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val label = stringResource(R.string.onboarding_zone_label)
    val shape = RoundedCornerShape(MichaelRadius.field)
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
        MichaelText(label, MichaelTextStyle.Label, colors.muted, Modifier.clearAndSetSemantics {})
        Row(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = MichaelSize.field)
                    .background(colors.solid, shape)
                    .border(1.dp, if (error == null) colors.border2 else colors.danger, shape)
                    .clickable(role = Role.Button, onClickLabel = label, onClick = onClick)
                    .semantics(mergeDescendants = true) { contentDescription = label }
                    .padding(horizontal = MichaelSpace.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MichaelText(zone, MichaelTextStyle.Body, colors.text, Modifier.weight(1f))
            MichaelText(michaelGmtOffset(zone), MichaelTextStyle.Body, colors.muted)
        }
        MichaelText(
            error ?: stringResource(R.string.onboarding_zone_note),
            MichaelTextStyle.Caption,
            if (error ==
                null
            ) {
                colors.muted
            } else {
                colors.danger
            },
        )
    }
}

@Composable
internal fun TimeRow(
    label: String,
    time: LocalTime,
    error: String? = null,
    onChange: (LocalTime) -> Unit,
) = MichaelTimeRow(
    label = label,
    time = time,
    doneLabel = stringResource(R.string.onboarding_time_done),
    cancelLabel = stringResource(R.string.onboarding_cancel),
    error = error,
    onChange = onChange,
)

@Composable
internal fun AwakeBar(
    wake: LocalTime,
    minutes: Int,
) {
    val colors = MichaelTheme.colors
    val start = wake.toSecondOfDay() / SECONDS_PER_DAY
    val length = minutes * SECONDS_PER_MINUTE / SECONDS_PER_DAY
    val text = stringResource(R.string.onboarding_sleep_awake, minutes / MINUTES_PER_HOUR, minutes % MINUTES_PER_HOUR)
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm), modifier = Modifier.semantics(mergeDescendants = true) {}) {
        androidx.compose.foundation.layout.BoxWithConstraints(
            Modifier
                .fillMaxWidth()
                .height(MichaelSize.progressTrack)
                .background(colors.track, CircleShape),
        ) {
            val full = maxWidth
            Box(
                Modifier
                    .offset(x = full * start)
                    .width(full * minOf(length, 1f - start))
                    .fillMaxHeight()
                    .background(colors.accent, CircleShape),
            )
            if (start + length > 1f) {
                Box(Modifier.width(full * (start + length - 1f)).fillMaxHeight().background(colors.accent, CircleShape))
            }
        }
        MichaelText(text, MichaelTextStyle.Label, colors.muted)
    }
}

@Composable
internal fun DayToggle(
    day: DayOfWeek,
    on: Boolean,
    modifier: Modifier = Modifier,
    onToggle: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val shape = RoundedCornerShape(MichaelRadius.button)
    val name = stringResource(day.nameRes)
    Box(
        modifier =
            modifier
                .heightIn(min = MichaelSize.button)
                .background(if (on) colors.fill else colors.solid.copy(alpha = 0f), shape)
                .border(1.dp, if (on) colors.fill else colors.border2, shape)
                .toggleable(value = on, role = Role.Checkbox, onValueChange = { onToggle() })
                .semantics { contentDescription = name },
        contentAlignment = Alignment.Center,
    ) {
        MichaelText(
            stringResource(
                day.initialRes,
            ),
            MichaelTextStyle.Button,
            if (on) colors.onfill else colors.muted,
            Modifier.clearAndSetSemantics {
            },
        )
    }
}

@Composable
internal fun PriorityRow(
    rank: Int,
    priority: String,
    onRemove: () -> Unit,
) {
    val colors = MichaelTheme.colors
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .background(
                    colors.solid,
                    RoundedCornerShape(MichaelRadius.field),
                ).padding(start = MichaelSpace.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.md),
    ) {
        Box(
            Modifier.size(MichaelSize.check).background(colors.accent, CircleShape).clearAndSetSemantics {},
            contentAlignment = Alignment.Center,
        ) {
            MichaelText(rank.toString(), MichaelTextStyle.Label, colors.onAccent)
        }
        MichaelText(priority, MichaelTextStyle.Body, colors.text, Modifier.weight(1f))
        val remove = stringResource(R.string.onboarding_priorities_remove, priority)
        Box(
            Modifier
                .size(MichaelSize.checkTouch)
                .clickable(role = Role.Button, onClickLabel = remove, onClick = onRemove)
                .semantics { contentDescription = remove },
            contentAlignment = Alignment.Center,
        ) {
            MichaelText("×", MichaelTextStyle.Heading, colors.muted, Modifier.clearAndSetSemantics {})
        }
    }
}

@Composable
internal fun SuggestionChip(
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val shape = RoundedCornerShape(MichaelRadius.pill)
    Box(
        modifier =
            Modifier
                .heightIn(min = MichaelSize.checkTouch)
                .background(colors.raise, shape)
                .border(1.dp, colors.border2, shape)
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(horizontal = MichaelSpace.md),
        contentAlignment = Alignment.Center,
    ) {
        MichaelText(label, MichaelTextStyle.Label, if (enabled) colors.text else colors.faint)
    }
}

@Composable
internal fun MinuteStepper(
    label: String,
    value: Int,
    range: IntRange,
    onChange: (Int) -> Unit,
) {
    val colors = MichaelTheme.colors
    val minutes = stringResource(R.string.onboarding_minutes, value)
    Row(
        modifier = Modifier.fillMaxWidth().semantics { stateDescription = minutes },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
    ) {
        MichaelText(label, MichaelTextStyle.Body, colors.text, Modifier.weight(1f))
        StepButton("−", stringResource(R.string.onboarding_shorter), value - OnboardingDraft.MINUTE_STEP in range) {
            onChange(value - OnboardingDraft.MINUTE_STEP)
        }
        MichaelText(minutes, MichaelTextStyle.Heading, colors.text, textAlign = TextAlign.Center)
        StepButton("+", stringResource(R.string.onboarding_longer), value + OnboardingDraft.MINUTE_STEP in range) {
            onChange(value + OnboardingDraft.MINUTE_STEP)
        }
    }
}

@Composable
private fun StepButton(
    symbol: String,
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val colors = MichaelTheme.colors
    Box(
        Modifier
            .size(MichaelSize.checkTouch)
            .background(colors.raise, CircleShape)
            .clickable(enabled = enabled, role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        MichaelText(symbol, MichaelTextStyle.Heading, if (enabled) colors.text else colors.faint, Modifier.clearAndSetSemantics {})
    }
}

@Composable
internal fun StyleOption(
    style: PlanningStyle,
    selected: Boolean,
    onSelect: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val shape = RoundedCornerShape(MichaelRadius.stat)
    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .background(if (selected) colors.chip else colors.solid, shape)
                .border(1.dp, if (selected) colors.accent else colors.border2, shape)
                .selectable(selected = selected, role = Role.RadioButton, onClick = onSelect)
                .padding(MichaelSpace.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.md),
    ) {
        Box(
            Modifier
                .size(MichaelSize.check)
                .border(
                    if (selected) MichaelSize.check / RADIO_RING_DIVISOR else 1.dp,
                    if (selected) colors.accent else colors.border2,
                    CircleShape,
                ),
        )
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
            MichaelText(stringResource(style.titleRes), MichaelTextStyle.Heading, colors.text)
            MichaelText(stringResource(style.detailRes), MichaelTextStyle.Label, colors.muted)
        }
    }
}

private val DayOfWeek.nameRes: Int
    get() =
        when (this) {
            DayOfWeek.Monday -> R.string.day_monday
            DayOfWeek.Tuesday -> R.string.day_tuesday
            DayOfWeek.Wednesday -> R.string.day_wednesday
            DayOfWeek.Thursday -> R.string.day_thursday
            DayOfWeek.Friday -> R.string.day_friday
            DayOfWeek.Saturday -> R.string.day_saturday
            DayOfWeek.Sunday, DayOfWeek.Unknown -> R.string.day_sunday
        }

private val DayOfWeek.initialRes: Int
    get() =
        when (this) {
            DayOfWeek.Monday -> R.string.day_monday_initial
            DayOfWeek.Tuesday -> R.string.day_tuesday_initial
            DayOfWeek.Wednesday -> R.string.day_wednesday_initial
            DayOfWeek.Thursday -> R.string.day_thursday_initial
            DayOfWeek.Friday -> R.string.day_friday_initial
            DayOfWeek.Saturday -> R.string.day_saturday_initial
            DayOfWeek.Sunday, DayOfWeek.Unknown -> R.string.day_sunday_initial
        }

private val PlanningStyle.titleRes: Int
    get() =
        when (this) {
            PlanningStyle.Structured -> R.string.style_structured
            PlanningStyle.Flexible -> R.string.style_flexible
            PlanningStyle.Balanced, PlanningStyle.Unknown -> R.string.style_balanced
        }

private val PlanningStyle.detailRes: Int
    get() =
        when (this) {
            PlanningStyle.Structured -> R.string.style_structured_detail
            PlanningStyle.Flexible -> R.string.style_flexible_detail
            PlanningStyle.Balanced, PlanningStyle.Unknown -> R.string.style_balanced_detail
        }

private const val SECONDS_PER_DAY = 86_400f
private const val SECONDS_PER_MINUTE = 60f
private const val MINUTES_PER_HOUR = 60
private const val RADIO_RING_DIVISOR = 3
