package com.michaelos.feature.onboarding

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.michaelos.core.designsystem.component.ErrorBanner
import com.michaelos.core.designsystem.component.FailureStateView
import com.michaelos.core.designsystem.component.MichaelBackButton
import com.michaelos.core.designsystem.component.MichaelBackground
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelPage
import com.michaelos.core.designsystem.component.MichaelProgressBar
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.AppError

@Composable
fun OnboardingScreen(
    suggestedName: String,
    deviceTimeZone: String,
    onFinished: () -> Unit,
    viewModel: OnboardingViewModel =
        hiltViewModel<OnboardingViewModel, OnboardingViewModel.Factory> { it.create(suggestedName, deviceTimeZone) },
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val stage = state.stage
    LaunchedEffect(stage) { if (stage == OnboardingStage.Finished) onFinished() }
    when (stage) {
        OnboardingStage.Loading, OnboardingStage.Finished -> {
            MichaelBackground(Modifier.fillMaxSize()) {
                CircularProgressIndicator(color = MichaelTheme.colors.accent, modifier = Modifier.align(Alignment.Center))
            }
        }

        is OnboardingStage.Failed -> {
            MichaelBackground(Modifier.fillMaxSize()) {
                FailureStateView(stage.error.onboardingMessage(), viewModel::load)
            }
        }

        is OnboardingStage.Step -> {
            BackHandler(enabled = stage.step.previous != null, onBack = viewModel::back)
            StepPage(state, stage.step, viewModel)
        }
    }
}

@Composable
private fun StepPage(
    state: OnboardingUiState,
    step: OnboardingStep,
    viewModel: OnboardingViewModel,
) {
    val colors = MichaelTheme.colors
    MichaelPage(
        footer = {
            MichaelButton(
                stringResource(
                    when {
                        state.isSaving -> R.string.onboarding_saving
                        step == OnboardingStep.Focus -> R.string.onboarding_finish
                        else -> R.string.onboarding_continue
                    },
                ),
                viewModel::advance,
                Modifier.fillMaxWidth(),
                enabled = !state.isSaving,
            )
            if (step == OnboardingStep.Work) {
                MichaelButton(
                    stringResource(R.string.onboarding_work_skip),
                    viewModel::skipWorkHours,
                    Modifier.fillMaxWidth(),
                    MichaelButtonStyle.Ghost,
                    enabled = !state.isSaving,
                )
            }
            if (step == OnboardingStep.Priorities) {
                MichaelButton(
                    stringResource(R.string.onboarding_priorities_skip),
                    viewModel::skipPriorities,
                    Modifier.fillMaxWidth(),
                    MichaelButtonStyle.Ghost,
                    enabled = !state.isSaving,
                )
            }
        },
    ) {
        ProgressHeader(step, if (step.previous == null) null else viewModel::back)
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            MichaelText(stringResource(step.title), MichaelTextStyle.Display, colors.text, Modifier.semantics { heading() })
            step.message?.let { MichaelText(stringResource(it), MichaelTextStyle.Body, colors.muted) }
        }
        state.problem?.let { ErrorBanner(it.onboardingMessage()) }
        when (step) {
            OnboardingStep.Name -> NameStep(state, viewModel)
            OnboardingStep.Sleep -> SleepStep(state, viewModel)
            OnboardingStep.Work -> WorkStep(state, viewModel)
            OnboardingStep.Priorities -> PrioritiesStep(state, viewModel)
            OnboardingStep.Focus -> FocusStep(state, viewModel)
        }
    }
}

@Composable
private fun ProgressHeader(
    step: OnboardingStep,
    onBack: (() -> Unit)?,
) {
    val total = OnboardingStep.entries.size
    val spoken = stringResource(R.string.onboarding_step_of, step.number, total)
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = MichaelSize.checkTouch),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.md),
    ) {
        if (onBack != null) MichaelBackButton(onBack)
        Box(Modifier.weight(1f).semantics { contentDescription = spoken }) {
            MichaelProgressBar(step.number.toFloat() / total)
        }
        MichaelText(
            stringResource(R.string.onboarding_step_short, step.number, total),
            MichaelTextStyle.Label,
            MichaelTheme.colors.muted,
            Modifier.clearAndSetSemantics {},
        )
    }
}

private val OnboardingStep.title: Int
    get() =
        when (this) {
            OnboardingStep.Name -> R.string.onboarding_name_title
            OnboardingStep.Sleep -> R.string.onboarding_sleep_title
            OnboardingStep.Work -> R.string.onboarding_work_title
            OnboardingStep.Priorities -> R.string.onboarding_priorities_title
            OnboardingStep.Focus -> R.string.onboarding_focus_title
        }

private val OnboardingStep.message: Int?
    get() =
        when (this) {
            OnboardingStep.Name -> R.string.onboarding_name_message
            OnboardingStep.Sleep -> R.string.onboarding_sleep_message
            OnboardingStep.Work -> R.string.onboarding_work_message
            OnboardingStep.Priorities -> R.string.onboarding_priorities_message
            OnboardingStep.Focus -> null
        }

@Composable
internal fun AppError.onboardingMessage(): String =
    when (this) {
        AppError.Offline -> stringResource(R.string.onboarding_error_offline)
        AppError.Timeout -> stringResource(R.string.onboarding_error_timeout)
        AppError.Decoding, is AppError.Unauthorized, is AppError.RateLimited -> null
        is AppError.Forbidden -> server.text
        is AppError.NotFound -> server.text
        is AppError.Conflict -> server.text
        is AppError.Server -> server.text
        is AppError.Validation -> server.text
    } ?: stringResource(R.string.onboarding_error_generic)

@Composable
internal fun FieldProblem.message(): String =
    when (this) {
        is FieldProblem.Server -> {
            text
        }

        FieldProblem.Local.NameRequired -> {
            stringResource(R.string.onboarding_name_required)
        }

        FieldProblem.Local.NameTooLong -> {
            pluralStringResource(
                R.plurals.onboarding_too_long,
                OnboardingDraft.NAME_LIMIT,
                OnboardingDraft.NAME_LIMIT,
            )
        }

        FieldProblem.Local.EndBeforeStart -> {
            stringResource(R.string.onboarding_work_end_after_start)
        }

        FieldProblem.Local.PriorityDuplicate -> {
            stringResource(R.string.onboarding_priorities_duplicate)
        }

        FieldProblem.Local.PriorityTooLong -> {
            pluralStringResource(
                R.plurals.onboarding_too_long,
                OnboardingDraft.PRIORITY_LENGTH,
                OnboardingDraft.PRIORITY_LENGTH,
            )
        }

        FieldProblem.Local.PrioritiesFull -> {
            stringResource(R.string.onboarding_priorities_full)
        }
    }
