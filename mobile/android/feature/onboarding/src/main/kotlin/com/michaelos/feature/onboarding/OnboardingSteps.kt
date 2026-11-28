package com.michaelos.feature.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import com.michaelos.core.designsystem.component.MichaelTextField
import com.michaelos.core.designsystem.component.MichaelTimeZonePicker
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.PlanningStyle

@Composable
internal fun NameStep(
    state: OnboardingUiState,
    viewModel: OnboardingViewModel,
) {
    var choosingZone by rememberSaveable { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg)) {
        MichaelTextField(
            stringResource(R.string.onboarding_name_field),
            state.draft.preferredName,
            { name -> viewModel.edit { it.copy(preferredName = name) } },
            error = state.fieldProblems["preferredName"]?.message(),
            autofill = ContentType.PersonFirstName,
        )
        ZoneRow(state.draft.timeZone, state.fieldProblems["timeZone"]?.message()) { choosingZone = true }
    }
    if (choosingZone) {
        MichaelTimeZonePicker(
            selected = state.draft.timeZone,
            title = stringResource(R.string.onboarding_zone_label),
            searchLabel = stringResource(R.string.onboarding_zone_search),
            cancelLabel = stringResource(R.string.onboarding_cancel),
            onSelect = { zone ->
                viewModel.edit { it.copy(timeZone = zone) }
                choosingZone = false
            },
            onDismiss = { choosingZone = false },
        )
    }
}

@Composable
internal fun SleepStep(
    state: OnboardingUiState,
    viewModel: OnboardingViewModel,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg)) {
        TimeRow(
            stringResource(R.string.onboarding_sleep_wake),
            state.draft.wakeUpTime,
        ) { time -> viewModel.edit { it.copy(wakeUpTime = time) } }
        TimeRow(stringResource(R.string.onboarding_sleep_bed), state.draft.bedtime) { time -> viewModel.edit { it.copy(bedtime = time) } }
        AwakeBar(state.draft.wakeUpTime, state.draft.awakeMinutes)
    }
}

@Composable
internal fun WorkStep(
    state: OnboardingUiState,
    viewModel: OnboardingViewModel,
) {
    val draft = state.draft
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg)) {
        MichaelText(stringResource(R.string.onboarding_work_days), MichaelTextStyle.Label, MichaelTheme.colors.muted)
        Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
            OnboardingDraft.WEEK.forEach { day ->
                DayToggle(day, day in draft.workDays, Modifier.weight(1f)) {
                    viewModel.edit { current ->
                        current.copy(workDays = if (day in current.workDays) current.workDays - day else current.workDays + day)
                    }
                }
            }
        }
        TimeRow(stringResource(R.string.onboarding_work_start), draft.workStartTime ?: OnboardingDraft.DEFAULT_WORK_START) { time ->
            viewModel.edit { it.copy(workStartTime = time, workEndTime = it.workEndTime ?: OnboardingDraft.DEFAULT_WORK_END) }
        }
        TimeRow(
            stringResource(R.string.onboarding_work_end),
            draft.workEndTime ?: OnboardingDraft.DEFAULT_WORK_END,
            error = state.fieldProblems["workEndTime"]?.message(),
        ) { time ->
            viewModel.edit { it.copy(workEndTime = time, workStartTime = it.workStartTime ?: OnboardingDraft.DEFAULT_WORK_START) }
        }
    }
}

@Composable
internal fun PrioritiesStep(
    state: OnboardingUiState,
    viewModel: OnboardingViewModel,
) {
    var typed by rememberSaveable { mutableStateOf("") }
    val priorities = state.draft.priorities
    val full = priorities.size >= OnboardingDraft.PRIORITY_LIMIT
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg)) {
        priorities.forEachIndexed { index, priority -> PriorityRow(index + 1, priority) { viewModel.removePriority(priority) } }
        MichaelTextField(
            stringResource(R.string.onboarding_priorities_own),
            typed,
            { typed = it },
            error = state.fieldProblems["priorities"]?.message(),
            keyboardActions = KeyboardActions(onDone = { if (viewModel.addPriority(typed)) typed = "" }),
        )
        MichaelText(
            stringResource(if (full) R.string.onboarding_priorities_full_hint else R.string.onboarding_priorities_suggestions),
            MichaelTextStyle.Label,
            MichaelTheme.colors.muted,
        )
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
            verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
        ) {
            OnboardingDraft.SUGGESTED_PRIORITIES.filterNot { it in priorities }.forEach { suggestion ->
                SuggestionChip(suggestion, enabled = !full) { viewModel.addPriority(suggestion) }
            }
        }
    }
}

@Composable
internal fun FocusStep(
    state: OnboardingUiState,
    viewModel: OnboardingViewModel,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg)) {
        MinuteStepper(
            stringResource(R.string.onboarding_focus_session),
            state.draft.focusSessionMinutes,
            OnboardingDraft.FOCUS_RANGE,
        ) { minutes ->
            viewModel.edit { it.copy(focusSessionMinutes = minutes) }
        }
        MinuteStepper(
            stringResource(R.string.onboarding_focus_break),
            state.draft.breakDurationMinutes,
            OnboardingDraft.BREAK_RANGE,
        ) { minutes ->
            viewModel.edit { it.copy(breakDurationMinutes = minutes) }
        }
        MichaelText(
            stringResource(R.string.onboarding_focus_style),
            MichaelTextStyle.Label,
            MichaelTheme.colors.muted,
            Modifier.fillMaxWidth().semantics { heading() },
        )
        listOf(PlanningStyle.Structured, PlanningStyle.Balanced, PlanningStyle.Flexible).forEach { style ->
            StyleOption(style, state.draft.planningStyle == style) { viewModel.edit { it.copy(planningStyle = style) } }
        }
    }
}
