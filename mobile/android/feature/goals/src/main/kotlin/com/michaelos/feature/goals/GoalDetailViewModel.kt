package com.michaelos.feature.goals

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation3.runtime.NavKey
import com.michaelos.core.data.GoalRepository
import com.michaelos.core.data.TaskChanges
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Goal
import com.michaelos.core.model.GoalChange
import com.michaelos.core.model.GoalMilestone
import com.michaelos.core.model.GoalStatus
import com.michaelos.core.model.MilestoneChange
import com.michaelos.core.model.MilestoneCreate
import com.michaelos.core.model.MilestoneStatus
import com.michaelos.core.model.Outcome
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import java.time.LocalDate

/** One goal, opened from the list. */
@Serializable
data class GoalDetailKey(
    val id: String,
) : NavKey

data class GoalDetail(
    val goal: Goal,
    val today: LocalDate,
    val busy: Action? = null,
    val problem: AppError? = null,
    /** A milestone check shown at once while its save is in flight. */
    val pendingCheck: Pair<String, MilestoneStatus>? = null,
) {
    enum class Action { Status, Progress, Delete, Milestone }

    val read: GoalRead? get() = if (goal.status == GoalStatus.Active) GoalRead.of(goal, today) else null

    val isWorkable: Boolean get() = goal.status == GoalStatus.Active && busy == null

    fun isDone(milestone: GoalMilestone): Boolean =
        pendingCheck?.takeIf { it.first == milestone.id }?.second?.let { it == MilestoneStatus.Completed }
            ?: (milestone.status == MilestoneStatus.Completed)
}

sealed interface GoalDetailUiState {
    data object Loading : GoalDetailUiState

    data class Content(
        val detail: GoalDetail,
    ) : GoalDetailUiState

    data class Failed(
        val error: AppError,
    ) : GoalDetailUiState

    /** Deleted here or elsewhere; the screen goes back to the list. */
    data object Gone : GoalDetailUiState
}

/**
 * Every change waits for the server and then reloads the goal, because milestone calls answer with the bare row and
 * the counts move with them. One change runs at a time, so a move cannot race the save before it.
 */
@HiltViewModel(assistedFactory = GoalDetailViewModel.Factory::class)
class GoalDetailViewModel
    @AssistedInject
    constructor(
        @Assisted val id: String,
        private val goals: GoalRepository,
        private val changes: TaskChanges,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<GoalDetailUiState>(GoalDetailUiState.Loading)
        val uiState: StateFlow<GoalDetailUiState> = mutableState.asStateFlow()

        private val detail: GoalDetail? get() = (mutableState.value as? GoalDetailUiState.Content)?.detail

        init {
            load()
        }

        fun load() {
            if (mutableState.value is GoalDetailUiState.Failed) mutableState.value = GoalDetailUiState.Loading
            viewModelScope.launch {
                val goal = async { goals.goal(id) }
                val today = async { detail?.today?.let { Outcome.Success(it) } ?: goals.today() }
                val (loaded, day) = goal.await() to today.await()
                when {
                    loaded is Outcome.Success && day is Outcome.Success -> {
                        mutableState.value = GoalDetailUiState.Content(GoalDetail(loaded.value, day.value))
                    }

                    else -> {
                        val error = (loaded as? Outcome.Failure)?.error ?: (day as Outcome.Failure).error
                        fail(error, initial = detail == null)
                    }
                }
            }
        }

        fun setStatus(status: GoalStatus) = perform(GoalDetail.Action.Status) { goals.change(id, GoalChange(status = status)) }

        fun setProgress(progress: Int) {
            val goal = detail?.goal ?: return
            if (goal.status != GoalStatus.Active || progress == goal.progress) return
            perform(GoalDetail.Action.Progress) { goals.change(id, GoalChange(progress = progress)) }
        }

        fun delete() {
            if (detail?.busy != null) return
            update { it.copy(busy = GoalDetail.Action.Delete, problem = null) }
            viewModelScope.launch {
                val outcome = goals.delete(id)
                if (outcome is Outcome.Failure && outcome.error !is AppError.NotFound) {
                    update { it.copy(busy = null, problem = outcome.error) }
                } else {
                    changes.changed()
                    mutableState.value = GoalDetailUiState.Gone
                }
            }
        }

        fun addMilestone(
            title: String,
            onAdded: () -> Unit,
        ) {
            val trimmed = title.trim().take(GoalForm.TITLE_LIMIT)
            if (trimmed.isEmpty()) return
            changeMilestones(onDone = onAdded) { goals.addMilestone(id, MilestoneCreate(trimmed)) }
        }

        fun rename(
            milestone: GoalMilestone,
            title: String,
        ) {
            val trimmed = title.trim().take(GoalForm.TITLE_LIMIT)
            if (trimmed.isEmpty() || trimmed == milestone.title) return
            changeMilestones { goals.changeMilestone(id, milestone.id, MilestoneChange(title = trimmed)) }
        }

        fun toggle(milestone: GoalMilestone) {
            if (detail?.isWorkable != true) return
            val status = if (milestone.status == MilestoneStatus.Completed) MilestoneStatus.Pending else MilestoneStatus.Completed
            update { it.copy(pendingCheck = milestone.id to status) }
            changeMilestones { goals.changeMilestone(id, milestone.id, MilestoneChange(status = status)) }
        }

        /** Up is -1, down is +1. The server renumbers the others. */
        fun move(
            milestone: GoalMilestone,
            offset: Int,
        ) {
            val milestones = detail?.goal?.milestones ?: return
            val index = milestones.indexOfFirst { it.id == milestone.id }
            if (index < 0 || index + offset !in milestones.indices) return
            changeMilestones { goals.changeMilestone(id, milestone.id, MilestoneChange(position = index + offset)) }
        }

        fun delete(milestone: GoalMilestone) =
            changeMilestones {
                val outcome = goals.deleteMilestone(id, milestone.id)
                if (outcome is Outcome.Failure && outcome.error is AppError.NotFound) Outcome.Success(Unit) else outcome
            }

        fun saved(goal: Goal) {
            update { it.copy(goal = goal) }
            changes.changed()
        }

        private fun changeMilestones(
            onDone: () -> Unit = {},
            work: suspend () -> Outcome<Unit>,
        ) {
            val current = detail ?: return
            if (current.goal.status != GoalStatus.Active || current.busy != null) return
            update { it.copy(busy = GoalDetail.Action.Milestone, problem = null) }
            viewModelScope.launch {
                val written = work()
                val fresh = goals.goal(id)
                when {
                    written is Outcome.Failure -> {
                        val goal = (fresh as? Outcome.Success)?.value
                        update { it.copy(goal = goal ?: it.goal, busy = null, pendingCheck = null, problem = written.error) }
                    }

                    fresh is Outcome.Success -> {
                        update { it.copy(goal = fresh.value, busy = null, pendingCheck = null) }
                        changes.changed()
                        onDone()
                    }

                    fresh is Outcome.Failure -> {
                        fail(fresh.error, initial = false)
                    }
                }
            }
        }

        private fun perform(
            action: GoalDetail.Action,
            work: suspend () -> Outcome<Goal>,
        ) {
            if (detail == null || detail?.busy != null) return
            update { it.copy(busy = action, problem = null) }
            viewModelScope.launch {
                when (val outcome = work()) {
                    is Outcome.Success -> {
                        update { it.copy(goal = outcome.value, busy = null) }
                        changes.changed()
                    }

                    is Outcome.Failure -> {
                        fail(outcome.error, initial = false)
                    }
                }
            }
        }

        private fun fail(
            error: AppError,
            initial: Boolean,
        ) {
            when {
                error is AppError.NotFound -> mutableState.value = GoalDetailUiState.Gone
                initial -> mutableState.value = GoalDetailUiState.Failed(error)
                else -> update { it.copy(busy = null, pendingCheck = null, problem = error) }
            }
        }

        private fun update(change: (GoalDetail) -> GoalDetail) {
            val current = detail ?: return
            mutableState.value = GoalDetailUiState.Content(change(current))
        }

        @AssistedFactory
        interface Factory {
            fun create(id: String): GoalDetailViewModel
        }
    }
