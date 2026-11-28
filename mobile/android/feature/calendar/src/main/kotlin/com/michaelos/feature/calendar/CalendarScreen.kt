package com.michaelos.feature.calendar

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.michaelos.core.designsystem.component.FailureStateView
import com.michaelos.core.designsystem.component.MichaelBackground
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonSize
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelIcons
import com.michaelos.core.designsystem.component.MichaelOrb
import com.michaelos.core.designsystem.component.MichaelOrbSize
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.CalendarEvent
import com.michaelos.core.model.PlanningProposal
import java.time.LocalDate
import java.util.UUID
import kotlin.math.abs

/** Where Calendar sends the user. */
class CalendarActions(
    val openAvailability: () -> Unit,
)

/** An open editor: a new event from [form], or [event] being changed. */
internal data class EditorRequest(
    val id: String,
    val form: EventForm,
    val event: CalendarEvent?,
)

/**
 * The day view with its week strip. Tasks without a time open from the bar under the grid; "Plan" asks Michael's
 * planner, and the sessions it suggests are drawn dashed until they are applied. [incoming] is a plan from the chat,
 * handed over once and then cleared through [onReceived].
 */
@Composable
fun CalendarScreen(
    actions: CalendarActions,
    incoming: PlanningProposal?,
    onReceived: () -> Unit,
    viewModel: CalendarViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_START) { viewModel.load() }
    LaunchedEffect(incoming) {
        if (incoming != null) {
            viewModel.receive(incoming)
            onReceived()
        }
    }
    var editor by remember { mutableStateOf<EditorRequest?>(null) }
    var showsUnscheduled by rememberSaveable { mutableStateOf(false) }
    MichaelBackground(Modifier.fillMaxSize()) {
        when (val current = state) {
            CalendarUiState.Loading -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    val label = stringResource(R.string.calendar_loading)
                    CircularProgressIndicator(Modifier.semantics { contentDescription = label }, color = MichaelTheme.colors.accent)
                }
            }

            is CalendarUiState.Failed -> {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    FailureStateView(current.error.message(), onRetry = viewModel::load)
                }
            }

            is CalendarUiState.Content -> {
                val content = current.content
                CalendarContentView(
                    content = content,
                    viewModel = viewModel,
                    onNewEvent = { editor = EditorRequest(UUID.randomUUID().toString(), EventForm.new(content.day, content.clock), null) },
                    onEdit = { event -> editor = EditorRequest(UUID.randomUUID().toString(), EventForm.of(event, content.clock), event) },
                    onUnscheduled = { showsUnscheduled = true },
                    onOpenAvailability = actions.openAvailability,
                )
                editor?.let { request ->
                    EventEditorSheet(
                        request = request,
                        clock = content.clock,
                        tasks = content.unscheduled,
                        onClose = { editor = null },
                    )
                }
                if (showsUnscheduled) {
                    UnscheduledSheet(content.unscheduled, onClose = { showsUnscheduled = false }) { task ->
                        showsUnscheduled = false
                        val form = EventForm.scheduling(task, maxOf(content.day, content.today), content.clock)
                        editor = EditorRequest(UUID.randomUUID().toString(), form, null)
                    }
                }
                if (content.plan != null) {
                    PlanSheet(content, viewModel) {
                        viewModel.closePlan()
                        actions.openAvailability()
                    }
                }
            }
        }
    }
}

@Composable
private fun CalendarContentView(
    content: CalendarContent,
    viewModel: CalendarViewModel,
    onNewEvent: () -> Unit,
    onEdit: (CalendarEvent) -> Unit,
    onUnscheduled: () -> Unit,
    onOpenAvailability: () -> Unit,
) {
    val colors = MichaelTheme.colors
    Column(
        Modifier.fillMaxSize().padding(horizontal = MichaelSpace.screenGutter).padding(top = MichaelSpace.lg),
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.md),
    ) {
        Header(content.day, onPlan = viewModel::openPlan, onNewEvent = onNewEvent)
        WeekStrip(content.day, content.today, viewModel::show)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Image(MichaelIcons.globe, null, Modifier.size(MichaelSpace.lg), colorFilter = ColorFilter.tint(colors.muted))
            MichaelText(
                stringResource(R.string.calendar_zone, content.clock.zone),
                MichaelTextStyle.Caption,
                colors.muted,
                Modifier.weight(1f).padding(start = MichaelSpace.sm),
            )
            WeekStep(
                MichaelIcons.chevronLeft,
                stringResource(R.string.calendar_week_previous),
            ) { viewModel.show(content.day.minusWeeks(1)) }
            WeekStep(MichaelIcons.chevronRight, stringResource(R.string.calendar_week_next)) { viewModel.show(content.day.plusWeeks(1)) }
        }
        if (!content.availabilityConfigured) AvailabilityNotice(onOpenAvailability)
        if (content.truncated) MichaelText(stringResource(R.string.calendar_truncated), MichaelTextStyle.Caption, colors.warn)
        DayGrid(
            day = content.day,
            clock = content.clock,
            items = gridItems(content),
            onEdit = onEdit,
            onToggle = viewModel::toggle,
            modifier = Modifier.weight(1f),
        )
        Bar(content, onReview = viewModel::openPlan, onDiscard = viewModel::discardPlan, onUnscheduled = onUnscheduled)
    }
}

private fun gridItems(content: CalendarContent): List<GridItem> {
    val review = content.review ?: return content.events.map(GridItem::Event)
    return content.events.map(GridItem::Event) +
        review.sessions.map { GridItem.Proposed(it, review.title(it.taskId).orEmpty(), review.isKept(it)) }
}

@Composable
private fun Header(
    day: LocalDate,
    onPlan: () -> Unit,
    onNewEvent: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val shape = RoundedCornerShape(MichaelRadius.button)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
            MichaelText(CalendarFormat.month(day), MichaelTextStyle.Eyebrow, colors.faint)
            MichaelText(CalendarFormat.dayTitle(day), MichaelTextStyle.Display, colors.text, Modifier.semantics { heading() })
        }
        Row(
            Modifier
                .heightIn(min = MichaelSize.checkTouch)
                .background(colors.chip, shape)
                .border(1.dp, colors.chipBorder, shape)
                .clickable(role = Role.Button, onClick = onPlan)
                .padding(horizontal = MichaelSpace.md),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
        ) {
            MichaelOrb(MichaelOrbSize.Small, Modifier.size(MichaelSpace.lg))
            MichaelText(stringResource(R.string.calendar_plan), MichaelTextStyle.Button, colors.atext)
        }
        val newEvent = stringResource(R.string.calendar_new_event)
        Box(
            Modifier
                .size(MichaelSize.checkTouch)
                .background(colors.fill, shape)
                .clickable(role = Role.Button, onClickLabel = newEvent, onClick = onNewEvent)
                .semantics { contentDescription = newEvent },
            contentAlignment = Alignment.Center,
        ) {
            Image(MichaelIcons.plus, null, Modifier.size(MichaelSize.check), colorFilter = ColorFilter.tint(colors.onfill))
        }
    }
}

@Composable
private fun WeekStrip(
    day: LocalDate,
    today: LocalDate,
    onPick: (LocalDate) -> Unit,
) {
    val colors = MichaelTheme.colors
    val shape = RoundedCornerShape(MichaelRadius.button)
    val swipe = with(LocalDensity.current) { MichaelSpace.xxl.toPx() }
    var dragged = 0f
    Row(
        Modifier.fillMaxWidth().pointerInput(day) {
            detectHorizontalDragGestures(onDragStart = { dragged = 0f }, onDragEnd = {
                if (abs(dragged) > swipe) onPick(if (dragged < 0) day.plusWeeks(1) else day.minusWeeks(1))
            }) { _, amount -> dragged += amount }
        },
        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.xs),
    ) {
        CalendarWeek.containing(day).days.forEach { date ->
            val chosen = date == day
            val label = CalendarFormat.fullDate(date)
            Column(
                Modifier
                    .weight(1f)
                    .heightIn(min = MichaelSize.weekDay)
                    .background(if (chosen) colors.fill else Color.Transparent, shape)
                    .border(1.dp, if (chosen) colors.fill else colors.border, shape)
                    .clickable(role = Role.Tab) { onPick(date) }
                    .semantics(mergeDescendants = true) {
                        contentDescription = label
                        selected = chosen
                    },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                val tone =
                    if (chosen) {
                        colors.onfill
                    } else if (date == today) {
                        colors.atext
                    } else {
                        colors.text
                    }
                MichaelText(CalendarFormat.weekdayShort(date), MichaelTextStyle.Caption, tone, maxLines = 1)
                MichaelText(date.dayOfMonth.toString(), MichaelTextStyle.Stat, tone, maxLines = 1)
            }
        }
    }
}

@Composable
private fun WeekStep(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
) {
    Box(
        Modifier
            .size(MichaelSize.checkTouch)
            .clickable(role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Image(icon, null, Modifier.size(MichaelSize.check), colorFilter = ColorFilter.tint(MichaelTheme.colors.muted))
    }
}

@Composable
private fun AvailabilityNotice(onOpen: () -> Unit) {
    val colors = MichaelTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .background(colors.warnBg, RoundedCornerShape(MichaelRadius.stat))
            .clickable(role = Role.Button, onClick = onOpen)
            .padding(MichaelSpace.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
    ) {
        MichaelText(stringResource(R.string.calendar_no_availability), MichaelTextStyle.Caption, colors.warn, Modifier.weight(1f))
        MichaelText(stringResource(R.string.calendar_no_availability_action), MichaelTextStyle.Label, colors.atext)
    }
}

@Composable
private fun Bar(
    content: CalendarContent,
    onReview: () -> Unit,
    onDiscard: () -> Unit,
    onUnscheduled: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val shape = RoundedCornerShape(MichaelRadius.stat)
    val review = content.review
    if (review != null) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(bottom = MichaelSpace.sm)
                .background(colors.chip, shape)
                .border(1.dp, colors.chipBorder, shape)
                .padding(horizontal = MichaelSpace.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MichaelText(
                pluralStringResource(R.plurals.calendar_bar_review, review.keptCount, review.keptCount),
                MichaelTextStyle.Label,
                colors.atext,
                Modifier
                    .weight(
                        1f,
                    ).heightIn(min = MichaelSize.button)
                    .clickable(role = Role.Button, onClick = onReview)
                    .padding(vertical = MichaelSpace.md),
            )
            MichaelButton(
                stringResource(R.string.calendar_bar_discard),
                onDiscard,
                style = MichaelButtonStyle.Ghost,
                size = MichaelButtonSize.Small,
            )
        }
    } else if (content.unscheduled.isNotEmpty()) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(bottom = MichaelSpace.sm)
                .heightIn(min = MichaelSize.button)
                .background(colors.solid, shape)
                .border(1.dp, colors.border2, shape)
                .clickable(role = Role.Button, onClick = onUnscheduled)
                .padding(horizontal = MichaelSpace.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MichaelText(
                pluralStringResource(R.plurals.calendar_bar_unscheduled, content.unscheduled.size, content.unscheduled.size),
                MichaelTextStyle.Label,
                colors.text,
                Modifier.weight(1f),
            )
            Image(MichaelIcons.chevronUp, null, Modifier.size(MichaelSize.check), colorFilter = ColorFilter.tint(colors.faint))
        }
    }
}
