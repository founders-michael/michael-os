package com.michaelos.feature.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.michaelos.core.data.ProfileRepository
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Outcome
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface OnboardingStage {
    data object Loading : OnboardingStage

    /** The saved profile could not be read; nothing is shown until it can be. */
    data class Failed(
        val error: AppError,
    ) : OnboardingStage

    data class Step(
        val step: OnboardingStep,
    ) : OnboardingStage

    /** Saved and completed. The app moves on. */
    data object Finished : OnboardingStage
}

/** Why a field is refused. Local ones are worded by the screen; server ones carry the server's sentence. */
sealed interface FieldProblem {
    enum class Local : FieldProblem { NameRequired, NameTooLong, EndBeforeStart, PriorityDuplicate, PriorityTooLong, PrioritiesFull }

    data class Server(
        val text: String,
    ) : FieldProblem
}

data class OnboardingUiState(
    val stage: OnboardingStage,
    val draft: OnboardingDraft,
    val isSaving: Boolean = false,
    /** A save that failed for a reason other than the answers themselves. */
    val problem: AppError? = null,
    /** Keyed by the server's field names. */
    val fieldProblems: Map<String, FieldProblem> = emptyMap(),
)

@HiltViewModel(assistedFactory = OnboardingViewModel.Factory::class)
class OnboardingViewModel
    @AssistedInject
    constructor(
        @Assisted("name") suggestedName: String,
        @Assisted("zone") deviceTimeZone: String,
        private val profiles: ProfileRepository,
    ) : ViewModel() {
        private val mutableState =
            MutableStateFlow(OnboardingUiState(OnboardingStage.Loading, OnboardingDraft.initial(suggestedName, deviceTimeZone)))
        val uiState: StateFlow<OnboardingUiState> = mutableState.asStateFlow()

        init {
            load()
        }

        /** Resumes at the step the server has saved, with the answers it holds. */
        fun load() {
            mutableState.update { it.copy(stage = OnboardingStage.Loading) }
            viewModelScope.launch {
                when (val outcome = profiles.profile()) {
                    is Outcome.Failure -> {
                        mutableState.update { it.copy(stage = OnboardingStage.Failed(outcome.error)) }
                    }

                    is Outcome.Success -> {
                        val profile = outcome.value
                        mutableState.update { state ->
                            state.copy(
                                draft = profile?.let(OnboardingDraft::of) ?: state.draft,
                                stage =
                                    if (profile?.onboardingCompleted == true) {
                                        OnboardingStage.Finished
                                    } else {
                                        OnboardingStage.Step(OnboardingStep.resumingAt(profile?.onboardingStep ?: 0))
                                    },
                            )
                        }
                    }
                }
            }
        }

        fun edit(change: (OnboardingDraft) -> OnboardingDraft) {
            mutableState.update { it.copy(draft = change(it.draft), fieldProblems = emptyMap(), problem = null) }
        }

        fun back() {
            val step = currentStep() ?: return
            val previous = step.previous ?: return
            mutableState.update { it.copy(stage = OnboardingStage.Step(previous), fieldProblems = emptyMap(), problem = null) }
        }

        /** Validates and saves the current step, then moves on. The last step also completes onboarding. */
        fun advance() {
            val step = currentStep() ?: return
            if (mutableState.value.isSaving) return
            if (step == OnboardingStep.Work) {
                mutableState.update { state ->
                    state.copy(
                        draft =
                            state.draft.copy(
                                workStartTime = state.draft.workStartTime ?: OnboardingDraft.DEFAULT_WORK_START,
                                workEndTime = state.draft.workEndTime ?: OnboardingDraft.DEFAULT_WORK_END,
                            ),
                    )
                }
            }
            val problems = validate(step, mutableState.value.draft)
            if (problems.isNotEmpty()) {
                mutableState.update { it.copy(fieldProblems = problems) }
                return
            }
            save(step)
        }

        /** "I don't have fixed hours": no work days and no hours. */
        fun skipWorkHours() {
            if (currentStep() != OnboardingStep.Work || mutableState.value.isSaving) return
            mutableState.update { it.copy(draft = it.draft.copy(workDays = emptyList(), workStartTime = null, workEndTime = null)) }
            save(OnboardingStep.Work)
        }

        fun skipPriorities() {
            if (currentStep() != OnboardingStep.Priorities || mutableState.value.isSaving) return
            mutableState.update { it.copy(draft = it.draft.copy(priorities = emptyList())) }
            save(OnboardingStep.Priorities)
        }

        /** Adds a priority typed by the user. Returns false, with a problem set, when it cannot be added. */
        fun addPriority(text: String): Boolean {
            val priority = text.trim()
            val priorities = mutableState.value.draft.priorities
            val problem =
                when {
                    priority.isEmpty() -> return false
                    priorities.size >= OnboardingDraft.PRIORITY_LIMIT -> FieldProblem.Local.PrioritiesFull
                    priority.length > OnboardingDraft.PRIORITY_LENGTH -> FieldProblem.Local.PriorityTooLong
                    priorities.any { it.equals(priority, ignoreCase = true) } -> FieldProblem.Local.PriorityDuplicate
                    else -> null
                }
            if (problem != null) {
                mutableState.update { it.copy(fieldProblems = mapOf("priorities" to problem)) }
                return false
            }
            edit { it.copy(priorities = it.priorities + priority) }
            return true
        }

        fun removePriority(priority: String) {
            edit { draft -> draft.copy(priorities = draft.priorities.filterNot { it == priority }) }
        }

        private fun currentStep(): OnboardingStep? = (mutableState.value.stage as? OnboardingStage.Step)?.step

        private fun save(step: OnboardingStep) {
            mutableState.update { it.copy(isSaving = true, problem = null) }
            viewModelScope.launch {
                val saved = profiles.save(mutableState.value.draft.update(step.serverStepAfter))
                val outcome =
                    when {
                        saved is Outcome.Failure -> saved
                        step.next == null -> profiles.complete()
                        else -> saved
                    }
                mutableState.update { state ->
                    when (outcome) {
                        is Outcome.Success -> {
                            state.copy(isSaving = false, stage = step.next?.let { OnboardingStage.Step(it) } ?: OnboardingStage.Finished)
                        }

                        is Outcome.Failure -> {
                            failed(state.copy(isSaving = false), outcome.error)
                        }
                    }
                }
            }
        }

        private fun failed(
            state: OnboardingUiState,
            error: AppError,
        ): OnboardingUiState {
            if (error !is AppError.Validation || error.fields.isEmpty()) return state.copy(problem = error)
            val problems =
                error.fields
                    .mapNotNull { (field, messages) ->
                        messages.firstOrNull()?.let { field to FieldProblem.Server(it) }
                    }.toMap()
            val first = OnboardingStep.entries.firstOrNull { step -> error.fields.keys.any { OnboardingStep.showing(it) == step } }
            return state.copy(fieldProblems = problems, stage = first?.let { OnboardingStage.Step(it) } ?: state.stage)
        }

        @AssistedFactory
        interface Factory {
            fun create(
                @Assisted("name") suggestedName: String,
                @Assisted("zone") deviceTimeZone: String,
            ): OnboardingViewModel
        }

        companion object {
            fun validate(
                step: OnboardingStep,
                draft: OnboardingDraft,
            ): Map<String, FieldProblem> =
                when (step) {
                    OnboardingStep.Name -> {
                        val name = draft.preferredName.trim()
                        when {
                            name.isEmpty() -> mapOf("preferredName" to FieldProblem.Local.NameRequired)
                            name.length > OnboardingDraft.NAME_LIMIT -> mapOf("preferredName" to FieldProblem.Local.NameTooLong)
                            else -> emptyMap()
                        }
                    }

                    OnboardingStep.Work -> {
                        val start = draft.workStartTime
                        val end = draft.workEndTime
                        if (start != null && end != null && !end.isAfter(start)) {
                            mapOf("workEndTime" to FieldProblem.Local.EndBeforeStart)
                        } else {
                            emptyMap()
                        }
                    }

                    OnboardingStep.Sleep, OnboardingStep.Priorities, OnboardingStep.Focus -> {
                        emptyMap()
                    }
                }
        }
    }
