package com.michaelos.feature.myday

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.michaelos.core.data.HabitRepository
import com.michaelos.core.data.MyDayRepository
import com.michaelos.core.data.TaskChanges
import com.michaelos.core.data.TaskRepository
import com.michaelos.core.model.AppError
import com.michaelos.core.model.MyDay
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.TaskStatus
import com.michaelos.core.model.TaskUpdate
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Clock
import java.time.Duration
import java.time.LocalDate
import javax.inject.Inject

sealed interface MyDayUiState {
    data object Loading : MyDayUiState

    data class Content(
        val day: MyDayContent,
    ) : MyDayUiState

    /** No tasks, no habits and nothing on the calendar for the date: one empty state, not three. */
    data class Empty(
        val day: MyDayContent,
    ) : MyDayUiState

    data class Failed(
        val error: AppError,
    ) : MyDayUiState
}

@HiltViewModel
class MyDayViewModel
    @Inject
    constructor(
        private val days: MyDayRepository,
        private val tasks: TaskRepository,
        private val habits: HabitRepository,
        private val changes: TaskChanges,
        private val clock: Clock,
        private val savedState: SavedStateHandle,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<MyDayUiState>(MyDayUiState.Loading)
        val uiState: StateFlow<MyDayUiState> = mutableState.asStateFlow()
        private var read: Job? = null
        private var seenVersion = changes.version.value

        /** The date asked for. Null follows the server's today, so the first refresh after midnight moves to the new day. */
        var requestedDate: LocalDate?
            get() = savedState.get<String>(REQUESTED_DATE)?.let(LocalDate::parse)
            private set(value) {
                savedState[REQUESTED_DATE] = value?.toString()
            }

        private val day: MyDayContent?
            get() =
                when (val state = mutableState.value) {
                    is MyDayUiState.Content -> state.day
                    is MyDayUiState.Empty -> state.day
                    MyDayUiState.Loading, is MyDayUiState.Failed -> null
                }

        init {
            load()
        }

        /** The screen started again, such as on return to the foreground, or another screen changed a task since. */
        fun appear() {
            val version = changes.version.value
            val changedElsewhere = version != seenVersion
            seenVersion = version
            when (mutableState.value) {
                MyDayUiState.Loading -> {
                    if (read?.isActive != true) load()
                }

                is MyDayUiState.Failed -> {
                    load()
                }

                is MyDayUiState.Content, is MyDayUiState.Empty -> {
                    val loadedAt = day?.loadedAt ?: return
                    if (changedElsewhere || Duration.between(loadedAt, clock.instant()) >= STALE_AFTER) refresh()
                }
            }
        }

        /** A first load, or a retry after a failure with nothing on screen. */
        fun load() {
            mutableState.value = MyDayUiState.Loading
            read(requestedDate) { outcome ->
                mutableState.value =
                    when (outcome) {
                        is Outcome.Success -> stateOf(MyDayContent(outcome.value, clock.instant()))
                        is Outcome.Failure -> MyDayUiState.Failed(outcome.error)
                    }
            }
        }

        /** Reloads over what is shown. A failure keeps the data on screen and says why. */
        fun refresh() {
            if (day == null) return load()
            updateDay { it.copy(isRefreshing = true) }
            read(requestedDate, onCancel = { updateDay { it.copy(isRefreshing = false) } }) { outcome ->
                when (outcome) {
                    is Outcome.Success -> updateDay { it.replacedWith(outcome.value, clock.instant()) }
                    is Outcome.Failure -> updateDay { it.copy(isRefreshing = false, refreshProblem = outcome.error) }
                }
            }
        }

        fun step(days: Long) {
            val current = day?.myDay ?: return
            val date = current.selectedDate.plusDays(days)
            requestedDate = date.takeUnless { it == current.today }
            load()
        }

        fun showToday() {
            if (requestedDate == null) return
            requestedDate = null
            load()
        }

        /** Completes an open task or reopens a completed one, on screen first. */
        fun toggleTask(id: String) {
            val current = day ?: return
            val row = current.tasks.firstOrNull { it.id == id } ?: return
            val status = row.status
            if (!row.canToggle || status == null) return
            val target = if (status == TaskStatus.Completed) TaskStatus.Todo else TaskStatus.Completed
            val selectedDate = current.myDay.selectedDate
            updateDay { it.copy(pendingTasks = it.pendingTasks + (id to target), rollbacks = it.rollbacks - id) }
            viewModelScope.launch {
                when (val outcome = tasks.update(id, TaskUpdate(target))) {
                    is Outcome.Success -> {
                        updateDay(selectedDate) { it.applying(outcome.value) }
                        changes.changed()
                        seenVersion = changes.version.value
                        refreshInPlace(selectedDate)
                    }

                    is Outcome.Failure -> {
                        updateDay(selectedDate) {
                            if (it.pendingTasks[id] != target) return@updateDay it
                            val action = if (target == TaskStatus.Completed) MyDayRollback.Action.Complete else MyDayRollback.Action.Reopen
                            it.copy(
                                pendingTasks = it.pendingTasks - id,
                                rollbacks =
                                    it.rollbacks + (id to MyDayRollback(action, outcome.error)),
                            )
                        }
                    }
                }
            }
        }

        /** Checks in a habit for today, or undoes today's check-in, on screen first. */
        fun toggleHabit(id: String) {
            val current = day ?: return
            val row = current.habits.firstOrNull { it.id == id }?.takeIf { it.canToggle } ?: return
            val target = !row.isDone
            val today = current.myDay.today
            val checkIn = row.habit.checkIns.firstOrNull { it.localDate == today }
            if (!target && checkIn == null) return refreshInPlace(today)
            updateDay { it.copy(pendingHabits = it.pendingHabits + (id to target), rollbacks = it.rollbacks - id) }
            viewModelScope.launch {
                val failure = if (checkIn == null || target) checkIn(id, today) else undo(checkIn.id, id, today)
                if (failure == null) {
                    refreshInPlace(today)
                } else {
                    rollBackHabit(id, target, today, failure)
                }
            }
        }

        private suspend fun checkIn(
            habitId: String,
            today: LocalDate,
        ): AppError? =
            when (val saved = habits.checkIn(habitId, today)) {
                is Outcome.Success -> null.also { updateDay(today) { it.applyingCheckIn(saved.value.checkIn, habitId) } }
                is Outcome.Failure -> saved.error
            }

        private fun rollBackHabit(
            habitId: String,
            target: Boolean,
            today: LocalDate,
            failure: AppError,
        ) = updateDay(today) {
            if (it.pendingHabits[habitId] != target) return@updateDay it
            val action = if (target) MyDayRollback.Action.CheckIn else MyDayRollback.Action.UndoCheckIn
            it.copy(pendingHabits = it.pendingHabits - habitId, rollbacks = it.rollbacks + (habitId to MyDayRollback(action, failure)))
        }

        /** Null when the check-in is gone, including when it was undone elsewhere already. */
        private suspend fun undo(
            checkInId: String,
            habitId: String,
            today: LocalDate,
        ): AppError? {
            val outcome = habits.undoCheckIn(habitId, checkInId)
            if (outcome is Outcome.Failure && outcome.error !is AppError.NotFound) return outcome.error
            updateDay(today) { it.removingCheckIn(checkInId, habitId) }
            return null
        }

        /** After a write: brings the server's counts and statuses in without showing a refresh. */
        private fun refreshInPlace(selectedDate: LocalDate) {
            if (day?.myDay?.selectedDate != selectedDate) return
            read(requestedDate, onCancel = { updateDay { it.copy(isRefreshing = false) } }) { outcome ->
                when (outcome) {
                    is Outcome.Success -> updateDay(selectedDate) { it.replacedWith(outcome.value, clock.instant()) }
                    is Outcome.Failure -> updateDay { it.copy(isRefreshing = false) }
                }
            }
        }

        /** One read at a time: a newer read cancels the one in flight. */
        private fun read(
            date: LocalDate?,
            onCancel: () -> Unit = {},
            onResult: (Outcome<MyDay>) -> Unit,
        ) {
            read?.cancel()
            val job = viewModelScope.launch { onResult(days.day(date)) }
            job.invokeOnCompletion { cause -> if (cause != null && read === job) onCancel() }
            read = job
        }

        private fun stateOf(day: MyDayContent): MyDayUiState = if (day.isEmpty) MyDayUiState.Empty(day) else MyDayUiState.Content(day)

        private fun updateDay(
            selectedDate: LocalDate? = null,
            change: (MyDayContent) -> MyDayContent,
        ) {
            val current = day ?: return
            if (selectedDate != null && current.myDay.selectedDate != selectedDate) return
            mutableState.value = stateOf(change(current))
        }

        private companion object {
            const val REQUESTED_DATE = "myDay.requestedDate"
            val STALE_AFTER: Duration = Duration.ofSeconds(60)
        }
    }
