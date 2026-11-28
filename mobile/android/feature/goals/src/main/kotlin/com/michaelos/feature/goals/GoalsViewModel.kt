package com.michaelos.feature.goals

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.michaelos.core.data.GoalRepository
import com.michaelos.core.data.TaskChanges
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Goal
import com.michaelos.core.model.GoalStatus
import com.michaelos.core.model.Outcome
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import javax.inject.Inject

/** Every goal, the status shown, and the server's today. */
data class GoalList(
    val all: List<Goal>,
    val today: LocalDate,
    val filter: GoalStatus = GoalStatus.Active,
) {
    val shown: List<Goal> get() = all.filter { it.status == filter }

    fun count(status: GoalStatus): Int = all.count { it.status == status }
}

sealed interface GoalsUiState {
    data object Loading : GoalsUiState

    data class Content(
        val list: GoalList,
    ) : GoalsUiState

    data class Failed(
        val error: AppError,
    ) : GoalsUiState
}

@HiltViewModel
class GoalsViewModel
    @Inject
    constructor(
        private val goals: GoalRepository,
        private val changes: TaskChanges,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<GoalsUiState>(GoalsUiState.Loading)
        val uiState: StateFlow<GoalsUiState> = mutableState.asStateFlow()
        private var seenVersion = changes.version.value

        private val list: GoalList? get() = (mutableState.value as? GoalsUiState.Content)?.list

        init {
            viewModelScope.launch {
                changes.version.collect { version ->
                    if (version != seenVersion) {
                        seenVersion = version
                        load()
                    }
                }
            }
        }

        /** Reads every goal; what is shown stays meanwhile. */
        fun load() {
            if (mutableState.value is GoalsUiState.Failed) mutableState.value = GoalsUiState.Loading
            viewModelScope.launch {
                val all = async { goals.list() }
                val today = async { goals.today() }
                val (listed, day) = all.await() to today.await()
                when {
                    listed is Outcome.Success && day is Outcome.Success -> {
                        mutableState.value =
                            GoalsUiState.Content(
                                list?.copy(all = listed.value, today = day.value) ?: GoalList(listed.value, day.value),
                            )
                    }

                    list == null -> {
                        val error = (listed as? Outcome.Failure)?.error ?: (day as Outcome.Failure).error
                        mutableState.value = GoalsUiState.Failed(error)
                    }
                }
            }
        }

        fun show(status: GoalStatus) {
            val current = list ?: return
            mutableState.value = GoalsUiState.Content(current.copy(filter = status))
        }

        /** A goal created in the editor. */
        fun saved(goal: Goal) {
            val current = list ?: return
            mutableState.value = GoalsUiState.Content(current.copy(all = listOf(goal) + current.all.filterNot { it.id == goal.id }))
            changes.changed()
            seenVersion = changes.version.value
        }
    }

data class GoalEditorUiState(
    val goal: Goal?,
    val original: GoalForm,
    val form: GoalForm,
    val saving: Boolean = false,
    val saved: Goal? = null,
    val failure: AppError? = null,
    val serverErrors: Map<String, String> = emptyMap(),
    val showsProblems: Boolean = false,
) {
    val hasChanges: Boolean get() = form != original
}

/** The create and edit sheet. It says saved only once the server has returned the goal. */
@HiltViewModel
class GoalEditorViewModel
    @Inject
    constructor(
        private val goals: GoalRepository,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<GoalEditorUiState?>(null)
        val uiState: StateFlow<GoalEditorUiState?> = mutableState.asStateFlow()
        private var request: String? = null

        /** Opens the form for [goal], or for a new one. A repeated call for the same [requestId] keeps what was typed. */
        fun start(
            requestId: String,
            goal: Goal?,
        ) {
            if (requestId == request) return
            request = requestId
            val form = goal?.let(GoalForm::of) ?: GoalForm()
            mutableState.value = GoalEditorUiState(goal, original = form, form = form)
        }

        fun edit(change: (GoalForm) -> GoalForm) {
            val current = mutableState.value ?: return
            val next =
                change(current.form).let {
                    it.copy(
                        title = it.title.take(GoalForm.TITLE_LIMIT),
                        notes = it.notes.take(GoalForm.NOTES_LIMIT),
                        category = it.category.take(GoalForm.CATEGORY_LIMIT),
                    )
                }
            mutableState.value = current.copy(form = next, serverErrors = emptyMap(), failure = null)
        }

        fun save() {
            val current = mutableState.value ?: return
            if (current.saving) return
            val body = current.form.save
            if (body == null) {
                mutableState.value = current.copy(showsProblems = true)
                return
            }
            mutableState.value = current.copy(showsProblems = true, saving = true)
            viewModelScope.launch {
                val outcome = goals.save(body, current.goal?.id)
                val state = mutableState.value ?: return@launch
                mutableState.value =
                    when (outcome) {
                        is Outcome.Success -> {
                            state.copy(saving = false, saved = outcome.value)
                        }

                        is Outcome.Failure -> {
                            val error = outcome.error
                            if (error is AppError.Validation && error.fields.isNotEmpty()) {
                                val fields = error.fields.mapNotNull { (key, value) -> value.firstOrNull()?.let { key to it } }.toMap()
                                state.copy(saving = false, serverErrors = fields)
                            } else {
                                state.copy(saving = false, failure = error)
                            }
                        }
                    }
            }
        }
    }
