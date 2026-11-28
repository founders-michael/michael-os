package com.michaelos.feature.calendar

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.michaelos.core.data.CalendarRepository
import com.michaelos.core.data.TaskChanges
import com.michaelos.core.model.AppError
import com.michaelos.core.model.CalendarConflict
import com.michaelos.core.model.CalendarEvent
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.PlanningProposal
import com.michaelos.core.model.ProposedSession
import com.michaelos.core.model.UnscheduledTask
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.LocalDate
import javax.inject.Inject

/** What the plan sheet shows. */
sealed interface PlanStep {
    data object Choosing : PlanStep

    data object Asking : PlanStep

    data object Reviewing : PlanStep

    data object Applying : PlanStep

    data class Applied(
        val count: Int,
    ) : PlanStep

    data class Failed(
        val problem: PlanProblem,
    ) : PlanStep
}

/** The week around the chosen day, the tasks without a time, and a plan under review with its sheet. */
data class CalendarContent(
    val clock: ZonedClock,
    val day: LocalDate,
    val events: List<CalendarEvent>,
    val truncated: Boolean,
    val availabilityConfigured: Boolean,
    val unscheduled: List<UnscheduledTask>,
    val review: PlanReview? = null,
    /** Null while the plan sheet is closed. */
    val plan: PlanStep? = null,
    val range: PlanRange,
) {
    val today: LocalDate get() = clock.today()
}

sealed interface CalendarUiState {
    data object Loading : CalendarUiState

    data class Content(
        val content: CalendarContent,
    ) : CalendarUiState

    data class Failed(
        val error: AppError,
    ) : CalendarUiState
}

/** The day view. The plan and its token live only in this state, in memory. */
@Suppress("TooManyFunctions") // The day view and its plan sheet act on the one review they both show.
@HiltViewModel
class CalendarViewModel
    @Inject
    constructor(
        private val calendar: CalendarRepository,
        private val changes: TaskChanges,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<CalendarUiState>(CalendarUiState.Loading)
        val uiState: StateFlow<CalendarUiState> = mutableState.asStateFlow()
        private var seenVersion = changes.version.value
        private var loadedWeek: CalendarWeek? = null

        private val content: CalendarContent? get() = (mutableState.value as? CalendarUiState.Content)?.content

        init {
            viewModelScope.launch {
                changes.version.collect { version ->
                    if (version != seenVersion) {
                        seenVersion = version
                        reload()
                    }
                }
            }
        }

        fun load() {
            if (mutableState.value is CalendarUiState.Failed) mutableState.value = CalendarUiState.Loading
            viewModelScope.launch { loadNow() }
        }

        private suspend fun loadNow() {
            when (val availability = calendar.availability()) {
                is Outcome.Failure -> {
                    if (content == null) mutableState.value = CalendarUiState.Failed(availability.error)
                }

                is Outcome.Success -> {
                    val clock = ZonedClock(availability.value.timeZone)
                    val day = content?.day ?: clock.today()
                    val tasks = viewModelScope.async { calendar.unscheduledTasks() }
                    when (val page = week(CalendarWeek.containing(day), clock)) {
                        is Outcome.Failure -> {
                            if (content == null) mutableState.value = CalendarUiState.Failed(page.error)
                        }

                        is Outcome.Success -> {
                            val unscheduled = (tasks.await() as? Outcome.Success)?.value ?: content?.unscheduled.orEmpty()
                            mutableState.value =
                                CalendarUiState.Content(
                                    content?.copy(
                                        clock = clock,
                                        events = page.value.events,
                                        truncated = page.value.truncated,
                                        availabilityConfigured = availability.value.configured,
                                        unscheduled = unscheduled,
                                    ) ?: CalendarContent(
                                        clock,
                                        day,
                                        page.value.events,
                                        page.value.truncated,
                                        availability.value.configured,
                                        unscheduled,
                                        range = PlanRange(day),
                                    ),
                                )
                        }
                    }
                }
            }
        }

        private suspend fun week(
            week: CalendarWeek,
            clock: ZonedClock,
        ) = calendar.events(week.range(clock).first, week.range(clock).second).also {
            if (it is Outcome.Success) loadedWeek = week
        }

        fun show(date: LocalDate) {
            val current = content ?: return
            update { it.copy(day = date) }
            val week = CalendarWeek.containing(date)
            if (week == loadedWeek) return
            viewModelScope.launch {
                when (val page = week(week, current.clock)) {
                    is Outcome.Success -> update { it.copy(events = page.value.events, truncated = page.value.truncated) }
                    is Outcome.Failure -> mutableState.value = CalendarUiState.Failed(page.error)
                }
            }
        }

        private fun reload() {
            if (content == null) return load()
            loadedWeek = null
            viewModelScope.launch { loadNow() }
        }

        fun toggle(session: ProposedSession) = update { it.copy(review = it.review?.toggle(session)) }

        fun discardPlan() = update { it.copy(review = null, plan = null) }

        /** The chat's plan, shown on the day of its first session with the sheet open. */
        fun receive(proposal: PlanningProposal) {
            val current = content
            if (current == null) {
                viewModelScope.launch {
                    loadNow()
                    receive(proposal)
                }
                return
            }
            val review = PlanReview(proposal)
            update { it.copy(review = review, plan = PlanStep.Reviewing) }
            review.sessions.firstOrNull()?.let { show(current.clock.date(it.startAt)) }
        }

        fun openPlan() =
            update {
                val first = maxOf(it.day, it.today)
                it.copy(
                    plan = if (it.review == null) PlanStep.Choosing else PlanStep.Reviewing,
                    range = if (it.range.first < it.today) PlanRange(first) else it.range,
                )
            }

        fun closePlan() = update { it.copy(plan = null) }

        fun setRange(range: PlanRange) = update { it.copy(range = range) }

        fun ask() {
            val current = content ?: return
            if (!current.range.isValid(current.today) || current.plan == PlanStep.Asking) return
            update { it.copy(plan = PlanStep.Asking) }
            viewModelScope.launch {
                when (val outcome = calendar.plan(current.range.request)) {
                    is Outcome.Success -> {
                        val review = PlanReview(outcome.value)
                        update { it.copy(review = review, plan = PlanStep.Reviewing.takeIf { _ -> it.plan != null }) }
                        review.sessions.firstOrNull()?.let { show(current.clock.date(it.startAt)) }
                    }

                    is Outcome.Failure -> {
                        update { it.copy(plan = PlanStep.Failed(PlanProblem.of(outcome.error)).takeIf { _ -> it.plan != null }) }
                    }
                }
            }
        }

        fun apply() {
            val review = content?.review
            if (content?.plan != PlanStep.Reviewing || review == null) return
            if (review.isExpired()) {
                update { it.copy(review = null, plan = PlanStep.Failed(PlanProblem.Stale(null))) }
                return
            }
            val body = review.apply ?: return
            update { it.copy(plan = PlanStep.Applying) }
            viewModelScope.launch {
                when (val outcome = calendar.apply(body)) {
                    is Outcome.Success -> {
                        update { it.copy(review = null, plan = PlanStep.Applied(outcome.value.createdCount)) }
                        changes.changed()
                    }

                    is Outcome.Failure -> {
                        val problem = PlanProblem.of(outcome.error)
                        update {
                            it.copy(review = if (problem is PlanProblem.Stale) null else it.review, plan = PlanStep.Failed(problem))
                        }
                    }
                }
            }
        }

        fun retry() {
            val current = content ?: return
            if (current.review == null) {
                update { it.copy(plan = PlanStep.Choosing) }
                ask()
            } else {
                update { it.copy(plan = PlanStep.Reviewing) }
                apply()
            }
        }

        /** Back to the dates, dropping the review and its token. */
        fun startOver() = update { it.copy(review = null, plan = PlanStep.Choosing) }

        private fun update(change: (CalendarContent) -> CalendarContent) {
            val current = content ?: return
            mutableState.value = CalendarUiState.Content(change(current))
        }
    }

data class EventEditorUiState(
    val event: CalendarEvent?,
    val clock: ZonedClock,
    val tasks: List<UnscheduledTask>,
    val original: EventForm,
    val form: EventForm,
    val busy: Boolean = false,
    val done: Boolean = false,
    val failure: AppError? = null,
    val conflicts: List<CalendarConflict> = emptyList(),
    val serverErrors: Map<String, String> = emptyMap(),
    val showsProblems: Boolean = false,
) {
    val hasChanges: Boolean get() = form != original
}

/** Create or edit one event. It says saved only once the server has the event; an overlap shows what it overlaps. */
@HiltViewModel
class EventEditorViewModel
    @Inject
    constructor(
        private val calendar: CalendarRepository,
        private val changes: TaskChanges,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<EventEditorUiState?>(null)
        val uiState: StateFlow<EventEditorUiState?> = mutableState.asStateFlow()
        private var request: String? = null

        /** A repeated call for the same [requestId] keeps what was typed. */
        fun start(
            requestId: String,
            form: EventForm,
            event: CalendarEvent?,
            clock: ZonedClock,
            tasks: List<UnscheduledTask>,
        ) {
            if (requestId == request) return
            request = requestId
            mutableState.value = EventEditorUiState(event, clock, tasks, original = form, form = form)
        }

        fun edit(change: (EventForm) -> EventForm) {
            val current = mutableState.value ?: return
            val next =
                change(
                    current.form,
                ).let { it.copy(title = it.title.take(EventForm.TITLE_LIMIT), notes = it.notes.take(EventForm.NOTES_LIMIT)) }
            mutableState.value = current.copy(form = next, failure = null, conflicts = emptyList(), serverErrors = emptyMap())
        }

        fun save() {
            val current = mutableState.value ?: return
            if (current.busy) return
            val event = current.event
            val create = if (event == null) current.form.create(current.clock) else null
            val change = if (event != null) current.form.update(current.clock) else null
            if (create == null && change == null) {
                mutableState.value = current.copy(showsProblems = true)
                return
            }
            mutableState.value = current.copy(showsProblems = true, busy = true)
            viewModelScope.launch {
                val outcome =
                    when {
                        event != null && change != null -> calendar.update(event.id, change)
                        create != null -> calendar.create(create)
                        else -> return@launch
                    }
                finish(outcome)
            }
        }

        fun delete() {
            val current = mutableState.value ?: return
            val event = current.event ?: return
            if (current.busy) return
            mutableState.value = current.copy(busy = true)
            viewModelScope.launch {
                val outcome = calendar.deleteEvent(event.id)
                finish(if (outcome is Outcome.Failure && outcome.error is AppError.NotFound) Outcome.Success(Unit) else outcome)
            }
        }

        private fun finish(outcome: Outcome<*>) {
            val state = mutableState.value ?: return
            mutableState.value =
                when (outcome) {
                    is Outcome.Success -> {
                        // Calendar, My Day and Tasks show sessions; each reloads on the bump.
                        changes.changed()
                        state.copy(busy = false, done = true)
                    }

                    is Outcome.Failure -> {
                        val error = outcome.error
                        when {
                            error is AppError.Conflict && error.server.conflicts.isNotEmpty() -> {
                                state.copy(busy = false, conflicts = error.server.conflicts)
                            }

                            error is AppError.Validation && error.fields.isNotEmpty() -> {
                                val fields = error.fields.mapNotNull { (key, value) -> value.firstOrNull()?.let { key to it } }.toMap()
                                state.copy(busy = false, serverErrors = fields, failure = error)
                            }

                            else -> {
                                state.copy(busy = false, failure = error)
                            }
                        }
                    }
                }
        }
    }
