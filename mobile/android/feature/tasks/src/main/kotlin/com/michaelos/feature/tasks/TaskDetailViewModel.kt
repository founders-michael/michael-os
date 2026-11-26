package com.michaelos.feature.tasks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation3.runtime.NavKey
import com.michaelos.core.data.TaskChanges
import com.michaelos.core.data.TaskRepository
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.Task
import com.michaelos.core.model.TaskStatus
import com.michaelos.core.model.TaskUpdate
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

/** One task, opened from the list. The list's time zone and today travel with it. */
@Serializable
data class TaskDetailKey(
    val id: String,
    val timeZone: String,
    val today: String?,
) : NavKey

data class TaskDetail(
    val task: Task,
    val pendingStatus: TaskStatus? = null,
    val busy: Action? = null,
    val problem: Problem? = null,
) {
    enum class Action { Status, Skip, Delete }

    data class Problem(
        val action: Action,
        val error: AppError,
    )

    val status: TaskStatus get() = pendingStatus ?: task.status
}

sealed interface TaskDetailUiState {
    data object Loading : TaskDetailUiState

    data class Content(
        val detail: TaskDetail,
    ) : TaskDetailUiState

    /** Deleted elsewhere since the list loaded. */
    data object NotFound : TaskDetailUiState

    data class Failed(
        val error: AppError,
    ) : TaskDetailUiState

    /** Deleted here; the screen goes back to the list. */
    data object Deleted : TaskDetailUiState
}

@HiltViewModel(assistedFactory = TaskDetailViewModel.Factory::class)
class TaskDetailViewModel
    @AssistedInject
    constructor(
        @Assisted val id: String,
        private val tasks: TaskRepository,
        private val changes: TaskChanges,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<TaskDetailUiState>(TaskDetailUiState.Loading)
        val uiState: StateFlow<TaskDetailUiState> = mutableState.asStateFlow()

        val detail: TaskDetail? get() = (mutableState.value as? TaskDetailUiState.Content)?.detail

        init {
            load()
        }

        /** Reads the task fresh; what is shown stays meanwhile. */
        fun load() {
            viewModelScope.launch {
                when (val outcome = tasks.task(id)) {
                    is Outcome.Success -> {
                        mutableState.value = TaskDetailUiState.Content(detail?.copy(task = outcome.value) ?: TaskDetail(outcome.value))
                    }

                    is Outcome.Failure -> {
                        if (outcome.error is AppError.NotFound) {
                            mutableState.value = TaskDetailUiState.NotFound
                        } else if (detail == null) {
                            mutableState.value = TaskDetailUiState.Failed(outcome.error)
                        }
                    }
                }
            }
        }

        /** Optimistic: the control moves at once and comes back, with the reason, if the server refuses. */
        fun setStatus(status: TaskStatus) {
            val current = detail ?: return
            if (current.busy != null || current.task.status == status) return
            update { it.copy(pendingStatus = status, busy = TaskDetail.Action.Status, problem = null) }
            perform(TaskDetail.Action.Status) { tasks.update(id, TaskUpdate(status)) }
        }

        fun skip() {
            val current = detail ?: return
            if (current.busy != null || current.task.activeRecurrence == null) return
            update { it.copy(busy = TaskDetail.Action.Skip, problem = null) }
            perform(TaskDetail.Action.Skip) { tasks.skip(id) }
        }

        fun delete() {
            if (detail?.busy != null) return
            update { it.copy(busy = TaskDetail.Action.Delete, problem = null) }
            viewModelScope.launch {
                when (val outcome = tasks.delete(id)) {
                    is Outcome.Success -> {
                        deleted()
                    }

                    is Outcome.Failure -> {
                        if (outcome.error is AppError.NotFound) {
                            deleted()
                        } else {
                            update { it.copy(busy = null, problem = TaskDetail.Problem(TaskDetail.Action.Delete, outcome.error)) }
                        }
                    }
                }
            }
        }

        /** The editor saved this task. */
        fun saved(task: Task) {
            update { it.copy(task = task) }
            changes.changed()
        }

        private fun deleted() {
            changes.changed()
            mutableState.value = TaskDetailUiState.Deleted
        }

        private fun perform(
            action: TaskDetail.Action,
            write: suspend () -> Outcome<Task>,
        ) {
            viewModelScope.launch {
                when (val outcome = write()) {
                    is Outcome.Success -> {
                        update { it.copy(task = outcome.value, pendingStatus = null, busy = null) }
                        changes.changed()
                    }

                    is Outcome.Failure -> {
                        if (outcome.error is AppError.NotFound) {
                            mutableState.value = TaskDetailUiState.NotFound
                        } else {
                            update { it.copy(pendingStatus = null, busy = null, problem = TaskDetail.Problem(action, outcome.error)) }
                        }
                    }
                }
            }
        }

        private fun update(edit: (TaskDetail) -> TaskDetail) {
            val current = detail ?: return
            mutableState.value = TaskDetailUiState.Content(edit(current))
        }

        @AssistedFactory
        interface Factory {
            fun create(id: String): TaskDetailViewModel
        }
    }
