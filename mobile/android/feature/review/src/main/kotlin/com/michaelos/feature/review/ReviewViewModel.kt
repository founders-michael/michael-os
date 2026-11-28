package com.michaelos.feature.review

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.michaelos.core.data.ReviewRepository
import com.michaelos.core.data.TaskChanges
import com.michaelos.core.model.AppError
import com.michaelos.core.model.CarryForward
import com.michaelos.core.model.DailyReview
import com.michaelos.core.model.Outcome
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import javax.inject.Inject

/** One date's review, the reflection being written, and the missed tasks moved from here. */
data class ReviewScreenState(
    val review: DailyReview,
    /** The server's today, from the first read (which sends no date). */
    val today: LocalDate,
    val draft: ReflectionDraft,
    val saveState: SaveState = SaveState.Saved,
    val moved: Map<String, Moved> = emptyMap(),
    val busyTask: String? = null,
    val moveProblems: Map<String, AppError> = emptyMap(),
)

sealed interface ReviewUiState {
    data object Loading : ReviewUiState

    data class Content(
        val screen: ReviewScreenState,
    ) : ReviewUiState

    data class Failed(
        val error: AppError,
    ) : ReviewUiState
}

@HiltViewModel
class ReviewViewModel
    @Inject
    constructor(
        private val reviews: ReviewRepository,
        private val changes: TaskChanges,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<ReviewUiState>(ReviewUiState.Loading)
        val uiState: StateFlow<ReviewUiState> = mutableState.asStateFlow()

        private val screen: ReviewScreenState? get() = (mutableState.value as? ReviewUiState.Content)?.screen
        private var saved = ReflectionDraft()
        private var saving = false
        private var pendingSave: Job? = null

        // Saves run outside viewModelScope so the one sent when the screen closes still reaches the server.
        private val saves = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

        init {
            load()
        }

        fun load(date: LocalDate? = screen?.review?.date) {
            if (mutableState.value is ReviewUiState.Failed) mutableState.value = ReviewUiState.Loading
            viewModelScope.launch {
                when (val outcome = reviews.review(date)) {
                    is Outcome.Success -> show(outcome.value)
                    is Outcome.Failure -> if (screen == null) mutableState.value = ReviewUiState.Failed(outcome.error)
                }
            }
        }

        private fun show(review: DailyReview) {
            val current = screen
            // A refresh of the same date keeps text that has not reached the server yet.
            val kept = current?.takeIf { it.review.date == review.date && it.saveState != SaveState.Saved }
            val draft = kept?.draft ?: ReflectionDraft.of(review.reflection)
            if (kept == null) saved = draft
            mutableState.value =
                ReviewUiState.Content(
                    ReviewScreenState(
                        review = review,
                        today = current?.today ?: review.date,
                        draft = draft,
                        saveState = kept?.saveState ?: SaveState.Saved,
                    ),
                )
        }

        /** Sends what is pending first, so changing the date never drops text. */
        fun showDays(offset: Long) {
            val date = screen?.review?.date ?: return
            flush()
            load(date.plusDays(offset))
        }

        fun edit(
            field: ReflectionDraft.Field,
            text: String,
        ) {
            update { it.copy(draft = it.draft.with(field, text)) }
            scheduleSave()
        }

        fun toggleSkipped(task: String) {
            update { it.copy(draft = it.draft.toggleSkipped(task)) }
            scheduleSave()
        }

        /** Saves now whatever has not been saved: leaving the screen or changing the date. */
        fun flush() {
            pendingSave?.cancel()
            saves.launch { saveNow() }
        }

        fun carryForward(
            task: String,
            form: CarryForwardForm,
        ) {
            val current = screen ?: return
            if (form.problem(current.review.date, current.today) != null) return
            move(task, CarryForward.move(task, current.review.date, form.date, form.startTime, form.endTime))
        }

        fun unschedule(task: String) {
            val current = screen ?: return
            move(task, CarryForward.unschedule(task, current.review.date))
        }

        private fun move(
            task: String,
            request: CarryForward,
        ) {
            if (screen?.busyTask != null) return
            update { it.copy(busyTask = task, moveProblems = it.moveProblems - task) }
            viewModelScope.launch {
                when (val outcome = reviews.carryForward(request)) {
                    is Outcome.Success -> {
                        val moved = outcome.value?.let { Moved.Date(it) } ?: Moved.Unscheduled
                        update { it.copy(busyTask = null, moved = it.moved + (task to moved)) }
                        changes.changed()
                    }

                    is Outcome.Failure -> {
                        update { it.copy(busyTask = null, moveProblems = it.moveProblems + (task to outcome.error)) }
                    }
                }
            }
        }

        private fun scheduleSave() {
            pendingSave?.cancel()
            val current = screen ?: return
            if (current.draft == saved) {
                if (!saving) update { it.copy(saveState = SaveState.Saved) }
                return
            }
            update { it.copy(saveState = SaveState.Unsaved) }
            pendingSave =
                saves.launch {
                    delay(AUTOSAVE_DELAY_MS)
                    saveNow()
                }
        }

        private suspend fun saveNow() {
            val current = screen ?: return
            if (saving || current.draft == saved) return
            saving = true
            update { it.copy(saveState = SaveState.Saving) }
            val snapshot = current.draft
            val date = current.review.date
            val outcome = reviews.save(snapshot.save(date))
            saving = false
            // The user moved to another date meanwhile; that date's draft and saved copy are its own.
            if (screen?.review?.date != date) return
            when (outcome) {
                is Outcome.Success -> {
                    saved = snapshot
                    // An edit made while this save was in flight is saved next.
                    if (screen?.draft == snapshot) update { it.copy(saveState = SaveState.Saved) } else scheduleSave()
                }

                is Outcome.Failure -> {
                    update { it.copy(saveState = SaveState.Failed(outcome.error)) }
                }
            }
        }

        override fun onCleared() {
            if (pendingSave?.isActive == true) flush()
        }

        private fun update(change: (ReviewScreenState) -> ReviewScreenState) {
            mutableState.update { state -> if (state is ReviewUiState.Content) ReviewUiState.Content(change(state.screen)) else state }
        }

        private companion object {
            const val AUTOSAVE_DELAY_MS = 750L
        }
    }
