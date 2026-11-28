package com.michaelos.feature.habits

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation3.runtime.NavKey
import com.michaelos.core.data.HabitRepository
import com.michaelos.core.data.TaskChanges
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Habit
import com.michaelos.core.model.HabitStatus
import com.michaelos.core.model.Outcome
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

/** One habit, opened from the list. */
@Serializable
data class HabitDetailKey(
    val id: String,
) : NavKey

data class HabitDetail(
    val habit: Habit,
    val busy: Action? = null,
    val problem: AppError? = null,
) {
    enum class Action { CheckIn, Status, Delete }
}

sealed interface HabitDetailUiState {
    data object Loading : HabitDetailUiState

    data class Content(
        val detail: HabitDetail,
    ) : HabitDetailUiState

    data class Failed(
        val error: AppError,
    ) : HabitDetailUiState

    /** Deleted here or elsewhere; the screen goes back to the list. */
    data object Gone : HabitDetailUiState
}

/** Today's check-in, archive, reactivate and delete wait for the server: each changes stats only it computes. */
@HiltViewModel(assistedFactory = HabitDetailViewModel.Factory::class)
class HabitDetailViewModel
    @AssistedInject
    constructor(
        @Assisted val id: String,
        private val habits: HabitRepository,
        private val changes: TaskChanges,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<HabitDetailUiState>(HabitDetailUiState.Loading)
        val uiState: StateFlow<HabitDetailUiState> = mutableState.asStateFlow()

        val detail: HabitDetail? get() = (mutableState.value as? HabitDetailUiState.Content)?.detail

        init {
            load()
        }

        fun load() {
            if (mutableState.value is HabitDetailUiState.Failed) mutableState.value = HabitDetailUiState.Loading
            viewModelScope.launch {
                when (val outcome = habits.habit(id)) {
                    is Outcome.Success -> show(outcome.value)
                    is Outcome.Failure -> fail(outcome.error, initial = detail == null)
                }
            }
        }

        fun toggleToday() {
            val habit = detail?.habit ?: return
            perform(HabitDetail.Action.CheckIn) {
                val write =
                    if (habit.completedToday) {
                        val checkIn = habit.checkIns.firstOrNull { it.localDate == habit.today }
                        val undo = checkIn?.let { habits.undoCheckIn(id, it.id) } ?: Outcome.Success(Unit)
                        if (undo is Outcome.Failure && undo.error is AppError.NotFound) Outcome.Success(Unit) else undo
                    } else {
                        habits.checkIn(id, habit.today).done()
                    }
                when (write) {
                    is Outcome.Success -> habits.habit(id)
                    is Outcome.Failure -> write
                }
            }
        }

        fun setArchived(archived: Boolean) =
            perform(HabitDetail.Action.Status) {
                habits.setStatus(id, if (archived) HabitStatus.Archived else HabitStatus.Active)
            }

        fun delete() {
            if (detail?.busy != null) return
            update { it.copy(busy = HabitDetail.Action.Delete, problem = null) }
            viewModelScope.launch {
                val outcome = habits.delete(id)
                if (outcome is Outcome.Failure && outcome.error !is AppError.NotFound) {
                    update { it.copy(busy = null, problem = outcome.error) }
                } else {
                    changes.changed()
                    mutableState.value = HabitDetailUiState.Gone
                }
            }
        }

        fun saved(habit: Habit) {
            show(habit)
            changes.changed()
        }

        private fun perform(
            action: HabitDetail.Action,
            work: suspend () -> Outcome<Habit>,
        ) {
            if (detail == null || detail?.busy != null) return
            update { it.copy(busy = action, problem = null) }
            viewModelScope.launch {
                when (val outcome = work()) {
                    is Outcome.Success -> {
                        show(outcome.value)
                        changes.changed()
                    }

                    is Outcome.Failure -> {
                        fail(outcome.error, initial = false)
                    }
                }
            }
        }

        private fun show(habit: Habit) {
            mutableState.value = HabitDetailUiState.Content(HabitDetail(habit))
        }

        private fun fail(
            error: AppError,
            initial: Boolean,
        ) {
            when {
                error is AppError.NotFound -> mutableState.value = HabitDetailUiState.Gone
                initial -> mutableState.value = HabitDetailUiState.Failed(error)
                else -> update { it.copy(busy = null, problem = error) }
            }
        }

        private fun update(change: (HabitDetail) -> HabitDetail) {
            val current = detail ?: return
            mutableState.value = HabitDetailUiState.Content(change(current))
        }

        @AssistedFactory
        interface Factory {
            fun create(id: String): HabitDetailViewModel
        }
    }
