package com.michaelos.feature.habits

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.michaelos.core.data.HabitRepository
import com.michaelos.core.data.TaskChanges
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Habit
import com.michaelos.core.model.HabitStatus
import com.michaelos.core.model.Outcome
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Every habit, the filter shown, and today's check-ins in flight. */
data class HabitList(
    val all: List<Habit>,
    val showsArchived: Boolean = false,
    /** Today's check-in state each habit is moving to while its write is in flight. */
    val pending: Map<String, Boolean> = emptyMap(),
    val rollbacks: Map<String, AppError> = emptyMap(),
) {
    val shown: List<Habit> get() = ordered(all.filter { it.status == if (showsArchived) HabitStatus.Archived else HabitStatus.Active })

    /** Michael's line reads every active habit, whichever filter is shown. */
    val line: HabitLine? get() = HabitLine.of(all)

    val scheduledToday: Int get() = all.count { it.dueToday }
    val completedToday: Int get() = all.count { it.dueToday && isDone(it) }

    fun isDone(habit: Habit): Boolean = pending[habit.id] ?: habit.completedToday
}

sealed interface HabitsUiState {
    data object Loading : HabitsUiState

    data class Content(
        val list: HabitList,
    ) : HabitsUiState

    data class Failed(
        val error: AppError,
    ) : HabitsUiState
}

@HiltViewModel
class HabitsViewModel
    @Inject
    constructor(
        private val habits: HabitRepository,
        private val changes: TaskChanges,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<HabitsUiState>(HabitsUiState.Loading)
        val uiState: StateFlow<HabitsUiState> = mutableState.asStateFlow()
        private var seenVersion = changes.version.value

        val list: HabitList? get() = (mutableState.value as? HabitsUiState.Content)?.list

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

        /** Reads every habit; what is shown stays meanwhile. */
        fun load() {
            if (mutableState.value is HabitsUiState.Failed) mutableState.value = HabitsUiState.Loading
            viewModelScope.launch {
                when (val outcome = habits.list()) {
                    is Outcome.Success -> {
                        mutableState.value = HabitsUiState.Content(list?.copy(all = outcome.value) ?: HabitList(outcome.value))
                    }

                    is Outcome.Failure -> {
                        if (list == null) mutableState.value = HabitsUiState.Failed(outcome.error)
                    }
                }
            }
        }

        fun showArchived(archived: Boolean) = update { it.copy(showsArchived = archived) }

        /** Checks in for today, or undoes today's check-in, on screen first; a refusal puts it back with the reason. */
        fun toggle(id: String) {
            val current = list ?: return
            val habit = current.all.firstOrNull { it.id == id } ?: return
            if (habit.status != HabitStatus.Active || id in current.pending) return
            val target = !habit.completedToday
            update { it.copy(pending = it.pending + (id to target), rollbacks = it.rollbacks - id) }
            viewModelScope.launch {
                val outcome = write(habit, target)
                if (outcome is Outcome.Failure) {
                    update { it.copy(pending = it.pending - id, rollbacks = it.rollbacks + (id to outcome.error)) }
                    return@launch
                }
                val fresh = habits.habit(id)
                update { list ->
                    val all = if (fresh is Outcome.Success) list.all.map { if (it.id == id) fresh.value else it } else list.all
                    list.copy(all = all, pending = list.pending - id)
                }
                announce()
            }
        }

        private suspend fun write(
            habit: Habit,
            target: Boolean,
        ): Outcome<Unit> {
            if (target) return habits.checkIn(habit.id, habit.today).done()
            val checkIn = habit.checkIns.firstOrNull { it.localDate == habit.today } ?: return Outcome.Success(Unit)
            val outcome = habits.undoCheckIn(habit.id, checkIn.id)
            // A check-in already undone elsewhere is the state the user asked for.
            return if (outcome is Outcome.Failure && outcome.error is AppError.NotFound) Outcome.Success(Unit) else outcome
        }

        /** A habit saved in the editor. */
        fun saved(habit: Habit) {
            update { list ->
                list.copy(
                    all =
                        if (list.all.any { it.id == habit.id }) {
                            list.all.map {
                                if (it.id ==
                                    habit.id
                                ) {
                                    habit
                                } else {
                                    it
                                }
                            }
                        } else {
                            listOf(habit) + list.all
                        },
                )
            }
            announce()
        }

        private fun announce() {
            changes.changed()
            seenVersion = changes.version.value
        }

        private fun update(change: (HabitList) -> HabitList) {
            val current = list ?: return
            mutableState.value = HabitsUiState.Content(change(current))
        }
    }
