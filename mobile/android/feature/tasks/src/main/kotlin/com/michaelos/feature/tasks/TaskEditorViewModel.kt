package com.michaelos.feature.tasks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.michaelos.core.data.TaskRepository
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.Task
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId
import javax.inject.Inject

data class TaskEditorUiState(
    val task: Task?,
    val timeZone: String,
    val today: LocalDate?,
    val original: TaskForm,
    val form: TaskForm,
    val status: Status = Status.Editing,
    /** The server's reasons, by field, from a refused save. */
    val serverErrors: Map<TaskForm.Field, String> = emptyMap(),
    /** A refusal that names no field, or a connection problem. */
    val failure: AppError? = null,
    /** Set once Save has been tried, so the form does not shout before the user is done. */
    val showsProblems: Boolean = false,
) {
    sealed interface Status {
        data object Editing : Status

        data object Saving : Status

        data class Saved(
            val task: Task,
        ) : Status
    }

    val isNew: Boolean get() = task == null

    /** Closing would lose what the user typed. */
    val hasChanges: Boolean get() = form != original

    /** What a field shows under it: the server's reason first, then the form's own once Save was tried. */
    fun problem(field: TaskForm.Field): TaskForm.Problem? = if (showsProblems) form.problems[field] else null
}

/** The create and edit sheet. It says saved only once the server has returned the task. */
@HiltViewModel
class TaskEditorViewModel
    @Inject
    constructor(
        private val tasks: TaskRepository,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<TaskEditorUiState?>(null)
        val uiState: StateFlow<TaskEditorUiState?> = mutableState.asStateFlow()
        private var request: String? = null

        /** Opens the form for [task], or for a new one. A repeated call for the same [requestId] keeps what was typed. */
        fun start(
            requestId: String,
            task: Task?,
            timeZone: String,
            today: LocalDate?,
        ) {
            if (requestId == request) return
            request = requestId
            val form = task?.let { TaskForm.of(it, zoneOf(timeZone)) } ?: TaskForm()
            mutableState.value = TaskEditorUiState(task, timeZone, today, original = form, form = form)
        }

        fun edit(change: (TaskForm) -> TaskForm) {
            val current = mutableState.value ?: return
            val next =
                change(current.form).let {
                    it.copy(
                        title = it.title.take(TaskForm.TITLE_LIMIT),
                        notes = it.notes.take(TaskForm.NOTES_LIMIT),
                        estimate = digits(it.estimate),
                        remaining = digits(it.remaining),
                    )
                }
            val cleared = current.serverErrors.filterKeys { valueOf(it, current.form) == valueOf(it, next) }
            mutableState.value = current.copy(form = next, serverErrors = cleared, failure = null)
        }

        fun save() {
            val current = mutableState.value ?: return
            if (current.status != TaskEditorUiState.Status.Editing) return
            val body = current.form.save(if (current.task == null) null else current.original)
            if (body == null) {
                mutableState.value = current.copy(showsProblems = true)
                return
            }
            mutableState.value =
                current.copy(status = TaskEditorUiState.Status.Saving, showsProblems = true, failure = null, serverErrors = emptyMap())
            viewModelScope.launch {
                val outcome = tasks.save(body, current.task?.id)
                val latest = mutableState.value ?: return@launch
                mutableState.value =
                    when (outcome) {
                        is Outcome.Success -> {
                            latest.copy(status = TaskEditorUiState.Status.Saved(outcome.value))
                        }

                        is Outcome.Failure -> {
                            val fields = (outcome.error as? AppError.Validation)?.fields.orEmpty()
                            val errors =
                                fields.entries.associate { (name, reasons) ->
                                    (TaskForm.Field.entries.firstOrNull { it.wire == name } ?: TaskForm.Field.Title) to
                                        reasons.firstOrNull().orEmpty()
                                }
                            latest.copy(
                                status = TaskEditorUiState.Status.Editing,
                                serverErrors = errors,
                                failure = outcome.error.takeIf { errors.isEmpty() },
                            )
                        }
                    }
            }
        }

        private fun digits(text: String): String = text.filter { it in '0'..'9' }.take(MINUTE_DIGITS)

        private fun valueOf(
            field: TaskForm.Field,
            form: TaskForm,
        ): Any? =
            when (field) {
                TaskForm.Field.Title -> form.title
                TaskForm.Field.Description -> form.notes
                TaskForm.Field.Estimate -> form.estimate
                TaskForm.Field.Remaining -> form.remaining
                TaskForm.Field.DueDate -> form.dueDate
                TaskForm.Field.Recurrence -> form.repeat
                TaskForm.Field.Reminder -> form.reminderDate to form.reminderTime
            }

        private companion object {
            const val MINUTE_DIGITS = 4
        }
    }

internal fun zoneOf(identifier: String): ZoneId =
    try {
        ZoneId.of(identifier)
    } catch (_: java.time.DateTimeException) {
        ZoneId.of("UTC")
    }
