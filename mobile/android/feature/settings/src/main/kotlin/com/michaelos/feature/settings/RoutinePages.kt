package com.michaelos.feature.settings

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.michaelos.core.designsystem.component.ErrorBanner
import com.michaelos.core.designsystem.component.FailureStateView
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelCard
import com.michaelos.core.designsystem.component.MichaelIcons
import com.michaelos.core.designsystem.component.MichaelSegmentedControl
import com.michaelos.core.designsystem.component.MichaelTextField
import com.michaelos.core.designsystem.component.MichaelTimeRow
import com.michaelos.core.designsystem.component.MichaelTimeZonePicker
import com.michaelos.core.designsystem.component.MichaelToggle
import com.michaelos.core.designsystem.component.michaelGmtOffset
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.AvailabilityWindow
import com.michaelos.core.model.DayOfWeek
import com.michaelos.core.model.PlanningStyle
import java.time.LocalTime

/** The onboarding answers, editable: time zone, sleep, work, priorities, focus and planning style. */
@Composable
internal fun RoutinePage(
    onBack: () -> Unit,
    viewModel: RoutineEditorViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(state.done) { if (state.done) onBack() }
    SettingsPageFrame(stringResource(R.string.settings_routine), onBack, action = {
        SaveAction(state.saving, enabled = state.hasChanges && state.form?.workHoursProblem == false, onSave = viewModel::save)
    }) {
        val failure = state.loadFailure
        val form = state.form
        when {
            failure != null -> FailureStateView(failure.message(), viewModel::load, Modifier.align(Alignment.Center))
            form == null -> Loading()
            else -> RoutineEditor(form, state, viewModel)
        }
    }
}

@Composable
private fun RoutineEditor(
    form: RoutineForm,
    state: RoutineEditorUiState,
    viewModel: RoutineEditorViewModel,
) {
    var choosingZone by rememberSaveable { mutableStateOf(false) }
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.md),
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg),
    ) {
        state.failure?.let { ErrorBanner(it.message()) }
        Group(stringResource(R.string.settings_routine_zone)) {
            val zoneLabel = stringResource(R.string.settings_routine_zone)
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = MichaelSize.field)
                    .clickable(role = Role.Button, onClickLabel = zoneLabel) { choosingZone = true },
                verticalAlignment = Alignment.CenterVertically,
            ) {
                MichaelText(form.timeZone, MichaelTextStyle.Body, MichaelTheme.colors.text, Modifier.weight(1f))
                MichaelText(michaelGmtOffset(form.timeZone), MichaelTextStyle.Body, MichaelTheme.colors.muted)
            }
            ServerError(state, "timeZone")
        }
        Group(stringResource(R.string.settings_routine_sleep)) {
            TimeRow(
                stringResource(R.string.settings_routine_wake),
                form.wakeUpTime,
            ) { time -> viewModel.edit { it.copy(wakeUpTime = time) } }
            TimeRow(stringResource(R.string.settings_routine_bed), form.bedtime) { time -> viewModel.edit { it.copy(bedtime = time) } }
        }
        WorkGroup(form, state, viewModel)
        PrioritiesGroup(form, state, viewModel)
        Group(stringResource(R.string.settings_routine_focus)) {
            MinuteStepper(stringResource(R.string.settings_routine_session), form.focusSessionMinutes, RoutineForm.FOCUS_RANGE) { value ->
                viewModel.edit { it.copy(focusSessionMinutes = value) }
            }
            MinuteStepper(stringResource(R.string.settings_routine_break), form.breakDurationMinutes, RoutineForm.BREAK_RANGE) { value ->
                viewModel.edit { it.copy(breakDurationMinutes = value) }
            }
            MichaelText(stringResource(R.string.settings_routine_style), MichaelTextStyle.Label, MichaelTheme.colors.muted)
            MichaelSegmentedControl(
                options = listOf(PlanningStyle.Structured, PlanningStyle.Balanced, PlanningStyle.Flexible),
                selected = form.planningStyle,
                onSelect = { style -> viewModel.edit { it.copy(planningStyle = style) } },
                title = { styleText(it) },
            )
        }
    }
    if (choosingZone) {
        MichaelTimeZonePicker(
            selected = form.timeZone,
            title = stringResource(R.string.settings_routine_zone),
            searchLabel = stringResource(R.string.settings_routine_zone_search),
            cancelLabel = stringResource(R.string.settings_cancel),
            onSelect = { zone ->
                viewModel.edit { it.copy(timeZone = zone) }
                choosingZone = false
            },
            onDismiss = { choosingZone = false },
        )
    }
}

@Composable
private fun WorkGroup(
    form: RoutineForm,
    state: RoutineEditorUiState,
    viewModel: RoutineEditorViewModel,
) {
    Group(stringResource(R.string.settings_routine_work)) {
        val daysLabel = stringResource(R.string.settings_routine_work_days)
        Row(Modifier.semantics { contentDescription = daysLabel }, horizontalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
            RoutineForm.WEEK.forEach { day ->
                DayButton(day, day in form.workDays, Modifier.weight(1f)) { viewModel.edit { it.toggle(day) } }
            }
        }
        MichaelToggle(stringResource(R.string.settings_routine_work_hours), form.hasWorkHours, { on ->
            viewModel.edit {
                it.copy(hasWorkHours = on)
            }
        })
        if (form.hasWorkHours) {
            TimeRow(stringResource(R.string.settings_routine_work_start), form.workStartTime) { time ->
                viewModel.edit {
                    it.copy(workStartTime = time)
                }
            }
            TimeRow(
                stringResource(R.string.settings_routine_work_end),
                form.workEndTime,
                stringResource(R.string.settings_routine_work_hours_problem).takeIf { form.workHoursProblem },
            ) { time -> viewModel.edit { it.copy(workEndTime = time) } }
        }
        ServerError(state, "workEndTime")
        ServerError(state, "workDays")
    }
}

@Composable
private fun PrioritiesGroup(
    form: RoutineForm,
    state: RoutineEditorUiState,
    viewModel: RoutineEditorViewModel,
) {
    var typed by rememberSaveable { mutableStateOf("") }
    var problem by rememberSaveable { mutableStateOf<RoutineForm.PriorityProblem?>(null) }
    Group(stringResource(R.string.settings_routine_priorities)) {
        form.priorities.forEach { priority ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                MichaelText(priority, MichaelTextStyle.Body, MichaelTheme.colors.text, Modifier.weight(1f))
                IconButton(MichaelIcons.clear, stringResource(R.string.settings_routine_priority_remove, priority)) {
                    viewModel.edit { it.copy(priorities = it.priorities - priority) }
                }
            }
        }
        if (form.priorities.size < RoutineForm.PRIORITY_LIMIT) {
            MichaelTextField(
                label = stringResource(R.string.settings_routine_priority_add),
                value = typed,
                onValueChange = {
                    typed = it
                    problem = null
                },
                error = problem?.let { priorityProblemText(it) },
                imeAction = ImeAction.Done,
                keyboardActions =
                    KeyboardActions(onDone = {
                        problem = viewModel.addPriority(typed)
                        if (problem == null) typed = ""
                    }),
            )
        }
        ServerError(state, "priorities")
    }
}

@Composable
private fun TimeRow(
    label: String,
    time: LocalTime,
    error: String? = null,
    onChange: (LocalTime) -> Unit,
) = MichaelTimeRow(label, time, stringResource(R.string.settings_done), stringResource(R.string.settings_cancel), error, onChange)

@Composable
private fun MinuteStepper(
    label: String,
    value: Int,
    range: IntRange,
    onChange: (Int) -> Unit,
) {
    val colors = MichaelTheme.colors
    val shown = pluralStringResource(R.plurals.settings_routine_minutes, value, value)
    Row(
        Modifier.fillMaxWidth().heightIn(min = MichaelSize.field).semantics { stateDescription = shown },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
    ) {
        MichaelText(label, MichaelTextStyle.Body, colors.text, Modifier.weight(1f))
        StepButton("−", stringResource(R.string.settings_routine_shorter, label), value - RoutineForm.MINUTE_STEP in range) {
            onChange(value - RoutineForm.MINUTE_STEP)
        }
        MichaelText(shown, MichaelTextStyle.Label, colors.muted)
        StepButton("+", stringResource(R.string.settings_routine_longer, label), value + RoutineForm.MINUTE_STEP in range) {
            onChange(value + RoutineForm.MINUTE_STEP)
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
private fun DayButton(
    day: DayOfWeek,
    isOn: Boolean,
    modifier: Modifier,
    toggle: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val shape = RoundedCornerShape(MichaelRadius.button)
    val name = weekdayText(day)
    Box(
        modifier
            .heightIn(min = MichaelSize.button)
            .background(if (isOn) colors.fill else colors.solid, shape)
            .border(1.dp, if (isOn) colors.fill else colors.border2, shape)
            .toggleable(value = isOn, role = Role.Checkbox, onValueChange = { toggle() })
            .semantics { contentDescription = name },
        contentAlignment = Alignment.Center,
    ) {
        MichaelText(dayInitial(day), MichaelTextStyle.Button, if (isOn) colors.onfill else colors.muted)
    }
}

/** The weekly hours Michael may plan focus sessions in, a card per weekday. */
@Composable
internal fun AvailabilityPage(
    onBack: () -> Unit,
    viewModel: AvailabilityEditorViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var editing by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(state.done) { if (state.done) onBack() }
    SettingsPageFrame(stringResource(R.string.settings_availability), onBack, action = {
        SaveAction(state.saving, enabled = state.canSave, onSave = viewModel::save)
    }) {
        val failure = state.loadFailure
        when {
            failure != null -> FailureStateView(failure.message(), viewModel::load, Modifier.align(Alignment.Center))
            state.loading -> Loading()
            else -> Week(state, onAdd = { editing = viewModel.add(it) }, onOpen = { editing = it })
        }
    }
    editing?.let { id ->
        if (state.plan.slots.none { it.id == id }) {
            editing = null
        } else {
            WindowSheet(state.plan, id, viewModel) { editing = null }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Week(
    state: AvailabilityEditorUiState,
    onAdd: (Int) -> Unit,
    onOpen: (String) -> Unit,
) {
    val colors = MichaelTheme.colors
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.md),
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.md),
    ) {
        MichaelText(stringResource(R.string.settings_availability_intro, state.plan.timeZone), MichaelTextStyle.Body, colors.muted)
        state.failure?.let { ErrorBanner(it.message()) }
        MichaelCard {
            Column(Modifier.padding(horizontal = MichaelSpace.md)) {
                for (weekday in 1..DAYS_IN_WEEK) {
                    val slots = state.plan.slots(weekday)
                    val problems = state.plan.problems(weekday)
                    val name = weekdayText(RoutineForm.WEEK[weekday - 1])
                    Column(Modifier.padding(vertical = MichaelSpace.sm), verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            MichaelText(name, MichaelTextStyle.Heading, colors.text, Modifier.weight(1f))
                            if (slots.isEmpty()) {
                                MichaelText(
                                    stringResource(R.string.settings_availability_none),
                                    MichaelTextStyle.Label,
                                    colors.muted,
                                )
                            }
                            IconButton(
                                MichaelIcons.plus,
                                stringResource(R.string.settings_availability_add, name),
                                state.plan.canAdd,
                            ) { onAdd(weekday) }
                        }
                        if (slots.isNotEmpty()) {
                            FlowRow(
                                horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
                                verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
                            ) {
                                slots.forEach { slot -> WindowChip(slot.window, state.plan.problem(slot.id) != null) { onOpen(slot.id) } }
                            }
                        }
                        if (AvailabilityPlan.Problem.Overlap in problems) {
                            MichaelText(stringResource(R.string.settings_availability_overlap), MichaelTextStyle.Caption, colors.danger)
                        }
                        if (AvailabilityPlan.Problem.Order in problems) {
                            MichaelText(stringResource(R.string.settings_availability_order), MichaelTextStyle.Caption, colors.danger)
                        }
                    }
                    if (weekday < DAYS_IN_WEEK) HorizontalDivider(color = colors.border)
                }
            }
        }
        MichaelText(stringResource(R.string.settings_availability_note), MichaelTextStyle.Caption, colors.faint)
    }
}

@Composable
private fun WindowChip(
    window: AvailabilityWindow,
    invalid: Boolean,
    open: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val shape = RoundedCornerShape(MichaelRadius.field)
    val range = windowRange(window)
    val status = stringResource(if (window.active) R.string.settings_availability_active else R.string.settings_availability_paused)
    MichaelText(
        range,
        MichaelTextStyle.Label,
        when {
            invalid -> colors.danger
            window.active -> colors.text
            else -> colors.faint
        },
        Modifier
            .heightIn(min = MichaelSize.checkTouch)
            .background(colors.raise, shape)
            .border(1.dp, if (invalid) colors.danger else colors.border2, shape)
            .clickable(role = Role.Button, onClick = open)
            .semantics { stateDescription = status }
            .padding(horizontal = MichaelSpace.md, vertical = MichaelSpace.md),
        textDecoration = if (window.active) null else TextDecoration.LineThrough,
    )
}

/** One window: its times, whether Michael may use it, and remove. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WindowSheet(
    plan: AvailabilityPlan,
    id: String,
    viewModel: AvailabilityEditorViewModel,
    onDismiss: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val window = plan.slots.first { it.id == id }.window
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = colors.solid,
    ) {
        Column(
            Modifier.padding(horizontal = MichaelSpace.screenGutter).padding(bottom = MichaelSpace.xl),
            verticalArrangement = Arrangement.spacedBy(MichaelSpace.md),
        ) {
            MichaelText(
                weekdayText(RoutineForm.WEEK[window.weekday - 1]),
                MichaelTextStyle.Heading,
                colors.text,
                Modifier.semantics { heading() },
            )
            TimeRow(stringResource(R.string.settings_availability_start), window.startTime) { time ->
                viewModel.edit { it.update(id) { w -> w.copy(startTime = time) } }
            }
            TimeRow(stringResource(R.string.settings_availability_end), window.endTime) { time ->
                viewModel.edit { it.update(id) { w -> w.copy(endTime = time) } }
            }
            MichaelToggle(stringResource(R.string.settings_availability_use), window.active, { on ->
                viewModel.edit {
                    it.update(id) { w -> w.copy(active = on) }
                }
            })
            when (plan.problem(id)) {
                AvailabilityPlan.Problem.Order -> {
                    MichaelText(
                        stringResource(R.string.settings_availability_order),
                        MichaelTextStyle.Caption,
                        colors.danger,
                    )
                }

                AvailabilityPlan.Problem.Overlap -> {
                    MichaelText(
                        stringResource(R.string.settings_availability_overlap),
                        MichaelTextStyle.Caption,
                        colors.danger,
                    )
                }

                null -> {}
            }
            MichaelButton(stringResource(R.string.settings_done), onDismiss, Modifier.fillMaxWidth())
            MichaelButton(
                stringResource(R.string.settings_availability_remove),
                {
                    viewModel.edit { it.remove(id) }
                    onDismiss()
                },
                Modifier.fillMaxWidth(),
                style = MichaelButtonStyle.Destructive,
            )
        }
    }
}

@Composable
private fun Group(
    title: String,
    content: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        MichaelText(title, MichaelTextStyle.Eyebrow, MichaelTheme.colors.muted, Modifier.semantics { heading() })
        content()
    }
}

@Composable
private fun ServerError(
    state: RoutineEditorUiState,
    field: String,
) {
    state.serverErrors[field]?.let { MichaelText(it, MichaelTextStyle.Caption, MichaelTheme.colors.danger) }
}

@Composable
internal fun IconButton(
    icon: ImageVector,
    label: String,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val colors = MichaelTheme.colors
    Box(
        Modifier
            .size(MichaelSize.checkTouch)
            .clickable(enabled = enabled, role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Image(icon, null, Modifier.size(MichaelSize.check), colorFilter = ColorFilter.tint(if (enabled) colors.atext else colors.faint))
    }
}

private const val DAYS_IN_WEEK = 7
