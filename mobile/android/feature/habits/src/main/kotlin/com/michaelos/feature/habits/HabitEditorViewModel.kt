package com.michaelos.feature.habits

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.michaelos.core.data.HabitRepository
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Habit
import com.michaelos.core.model.Outcome
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HabitEditorUiState(
    val habit: Habit?,
    val original: HabitForm,
    val form: HabitForm,
    val saving: Boolean = false,
    val saved: Habit? = null,
    val failure: AppError? = null,
    val serverErrors: Map<String, String> = emptyMap(),
    val showsProblems: Boolean = false,
) {
    val hasChanges: Boolean get() = form != original
}

/** The create and edit sheet. It says saved only once the server has returned the habit. */
@HiltViewModel
class HabitEditorViewModel
    @Inject
    constructor(
        private val habits: HabitRepository,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<HabitEditorUiState?>(null)
        val uiState: StateFlow<HabitEditorUiState?> = mutableState.asStateFlow()
        private var request: String? = null

        /** Opens the form for [habit], or for a new one. A repeated call for the same [requestId] keeps what was typed. */
        fun start(
            requestId: String,
            habit: Habit?,
        ) {
            if (requestId == request) return
            request = requestId
            val form = habit?.let(HabitForm::of) ?: HabitForm()
            mutableState.value = HabitEditorUiState(habit, original = form, form = form)
        }

        fun edit(change: (HabitForm) -> HabitForm) {
            val current = mutableState.value ?: return
            val next =
                change(
                    current.form,
                ).let { it.copy(title = it.title.take(HabitForm.TITLE_LIMIT), notes = it.notes.take(HabitForm.NOTES_LIMIT)) }
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
                val outcome = habits.save(body, current.habit?.id)
                val state = mutableState.value ?: return@launch
                mutableState.value =
                    when (outcome) {
                        is Outcome.Success -> {
                            state.copy(saving = false, saved = outcome.value)
                        }

                        is Outcome.Failure -> {
                            val error = outcome.error
                            if (error is AppError.Validation && error.fields.isNotEmpty()) {
                                state.copy(
                                    saving = false,
                                    serverErrors =
                                        error.fields
                                            .mapNotNull { (key, value) ->
                                                value.firstOrNull()?.let {
                                                    key to
                                                        it
                                                }
                                            }.toMap(),
                                )
                            } else {
                                state.copy(saving = false, failure = error)
                            }
                        }
                    }
            }
        }
    }
