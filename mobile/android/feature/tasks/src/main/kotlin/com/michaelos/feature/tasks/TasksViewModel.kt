package com.michaelos.feature.tasks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.michaelos.core.data.ProfileRepository
import com.michaelos.core.data.TaskChanges
import com.michaelos.core.data.TaskIntelligenceRepository
import com.michaelos.core.data.TaskRepository
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.RankedTask
import com.michaelos.core.model.Task
import com.michaelos.core.model.TaskPage
import com.michaelos.core.model.TaskPriority
import com.michaelos.core.model.TaskQuery
import com.michaelos.core.model.TaskSort
import com.michaelos.core.model.TaskStatus
import com.michaelos.core.model.TaskSummary
import com.michaelos.core.model.TaskUpdate
import com.michaelos.core.model.TaskView
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Clock
import java.time.Duration
import java.time.Instant
import javax.inject.Inject
import kotlin.time.Duration.Companion.milliseconds

/** What the task list shows: the loaded pages for the current filters, the counts, and every write in flight. */
data class TaskList(
    val query: TaskQuery,
    val tasks: List<Task>,
    val pages: Int,
    val total: Int,
    val summary: TaskSummary?,
    val timeZone: String,
    val loadedAt: Instant,
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    /** A later page failed; the earlier ones stay on screen. */
    val moreProblem: AppError? = null,
    val refreshProblem: AppError? = null,
    /** The status each row is moving to while its write is in flight: the user's latest choice. */
    val pending: Map<String, TaskStatus> = emptyMap(),
    val rollbacks: Map<String, TaskRollback> = emptyMap(),
    /** Each task's place in Michael's order, while the list shows it. */
    val ranking: Map<String, RankedTask> = emptyMap(),
) {
    val canLoadMore: Boolean get() = query.page < pages && !isLoadingMore

    fun statusOf(task: Task): TaskStatus = pending[task.id] ?: task.status

    fun applying(saved: Task): TaskList = copy(tasks = tasks.map { if (it.id == saved.id) saved else it })
}

data class TaskRollback(
    val completing: Boolean,
    val error: AppError,
)

sealed interface TasksUiState {
    data object Loading : TasksUiState

    data class Content(
        val list: TaskList,
    ) : TasksUiState

    /** Nothing matches the filters; the wording depends on them. */
    data class Empty(
        val list: TaskList,
    ) : TasksUiState

    data class Failed(
        val error: AppError,
    ) : TasksUiState
}

@HiltViewModel
class TasksViewModel
    @Inject
    constructor(
        private val tasks: TaskRepository,
        private val intelligence: TaskIntelligenceRepository,
        private val profiles: ProfileRepository,
        private val changes: TaskChanges,
        private val clock: Clock,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<TasksUiState>(TasksUiState.Loading)
        val uiState: StateFlow<TasksUiState> = mutableState.asStateFlow()
        private val mutableQuery = MutableStateFlow(TaskQuery())
        val query: StateFlow<TaskQuery> = mutableQuery.asStateFlow()
        private val mutableSearch = MutableStateFlow("")

        /** What is typed in the search field; the list follows it after a pause. */
        val searchText: StateFlow<String> = mutableSearch.asStateFlow()

        internal var searchPause = SEARCH_PAUSE
        private var timeZone: String? = null
        private var readGeneration = 0
        private var read: Job? = null
        private var searchJob: Job? = null
        private val writes = mutableSetOf<String>()
        private var seenVersion = changes.version.value

        val list: TaskList?
            get() =
                when (val state = mutableState.value) {
                    is TasksUiState.Content -> state.list
                    is TasksUiState.Empty -> state.list
                    TasksUiState.Loading, is TasksUiState.Failed -> null
                }

        init {
            load()
        }

        /** The screen started again, or another screen changed a task since. */
        fun appear() {
            val version = changes.version.value
            val changedElsewhere = version != seenVersion
            seenVersion = version
            when (mutableState.value) {
                TasksUiState.Loading -> {
                    if (read?.isActive != true) load()
                }

                is TasksUiState.Failed -> {
                    load()
                }

                is TasksUiState.Content, is TasksUiState.Empty -> {
                    val loadedAt = list?.loadedAt ?: return
                    if (changedElsewhere || Duration.between(loadedAt, clock.instant()) >= STALE_AFTER) refresh()
                }
            }
        }

        /** A first load, or a retry with nothing on screen. */
        fun load() {
            mutableState.value = TasksUiState.Loading
            read(mutableQuery.value, replacing = true)
        }

        /** Reloads the first page over what is shown. A failure keeps the list and says why. */
        fun refresh() {
            if (list == null) return load()
            update { it.copy(isRefreshing = true) }
            read(mutableQuery.value, replacing = true)
        }

        fun select(view: TaskView) = change { it.copy(view = view) }

        fun select(priority: TaskPriority?) = change { it.copy(priority = priority) }

        fun select(sort: TaskSort) = change { it.copy(sort = sort) }

        /** Typing: the request waits for a pause and replaces any search still in flight. */
        fun search(text: String) {
            mutableSearch.value = text
            searchJob?.cancel()
            searchJob =
                viewModelScope.launch {
                    delay(searchPause)
                    change { it.copy(search = text) }
                }
        }

        fun loadMore() {
            val current = list ?: return
            if (!current.canLoadMore) return
            update { it.copy(isLoadingMore = true, moreProblem = null) }
            read(current.query.copy(page = current.query.page + 1), replacing = false)
        }

        /** Completes an open task or reopens a completed one, on screen first. */
        fun toggle(id: String) {
            val current = list ?: return
            val task = current.tasks.firstOrNull { it.id == id } ?: return
            val target = if (current.statusOf(task) == TaskStatus.Completed) TaskStatus.Todo else TaskStatus.Completed
            setStatus(id, target)
        }

        /** Taps while a write is in flight change the target; the row ends in the state chosen last. */
        private fun setStatus(
            id: String,
            target: TaskStatus,
        ) {
            update { it.copy(pending = it.pending + (id to target), rollbacks = it.rollbacks - id) }
            if (!writes.add(id)) return
            viewModelScope.launch {
                var sent = target
                var spawned = false
                var failure: AppError?
                var again: Boolean
                do {
                    val outcome = tasks.update(id, TaskUpdate(sent))
                    failure = (outcome as? Outcome.Failure)?.error
                    val reached =
                        when (outcome) {
                            is Outcome.Success -> {
                                spawned =
                                    spawned || (outcome.value.status == TaskStatus.Completed && outcome.value.activeRecurrence != null)
                                update { it.applying(outcome.value) }
                                outcome.value.status
                            }

                            is Outcome.Failure -> {
                                sent
                            }
                        }
                    val wanted = list?.pending?.get(id)
                    again = wanted != null && wanted != reached
                    if (wanted != null && again) sent = wanted
                } while (again)
                writes.remove(id)
                if (failure != null) {
                    update {
                        it.copy(
                            pending = it.pending - id,
                            rollbacks =
                                it.rollbacks + (id to TaskRollback(sent == TaskStatus.Completed, failure)),
                        )
                    }
                    return@launch
                }
                update { it.copy(pending = it.pending - id) }
                changes.changed()
                seenVersion = changes.version.value
                // Completing a repeating task creates its next occurrence on the server; the list reloads to show it.
                if (spawned) refresh() else refreshSummary()
            }
        }

        /** A task saved or deleted on the editor or the detail screen. */
        fun changed() {
            changes.changed()
            seenVersion = changes.version.value
            refresh()
        }

        private fun change(edit: (TaskQuery) -> TaskQuery) {
            val next = edit(mutableQuery.value).copy(page = 1)
            if (next == mutableQuery.value) return
            mutableQuery.value = next
            if (list == null) mutableState.value = TasksUiState.Loading else update { it.copy(isRefreshing = true) }
            read(next, replacing = true)
        }

        private fun read(
            query: TaskQuery,
            replacing: Boolean,
        ) {
            read?.cancel()
            val generation = ++readGeneration
            read =
                viewModelScope.launch {
                    val summary = async { tasks.summary() }
                    val zone = async { resolvedTimeZone() }
                    val page = page(query)
                    val counts = (summary.await() as? Outcome.Success)?.value
                    val timeZone = zone.await()
                    if (generation != readGeneration) return@launch
                    when {
                        page is Outcome.Failure -> fail(page.error, replacing)
                        timeZone is Outcome.Failure -> fail(timeZone.error, replacing)
                        page is Outcome.Success && timeZone is Outcome.Success -> show(query, page.value, counts, timeZone.value, replacing)
                    }
                }
        }

        /** Michael's order comes from its own endpoint, with each task's reasons. */
        private suspend fun page(query: TaskQuery): Outcome<Pair<TaskPage, Map<String, RankedTask>>> {
            if (query.sort != TaskSort.Michael) {
                return when (val page = tasks.list(query)) {
                    is Outcome.Success -> Outcome.Success(page.value to emptyMap())
                    is Outcome.Failure -> page
                }
            }
            return when (val ranked = intelligence.priorities(query.page)) {
                is Outcome.Success -> {
                    val value = ranked.value
                    val page = TaskPage(value.tasks.map { it.task }, value.page, TaskQuery.PAGE_SIZE, value.total, value.pages)
                    Outcome.Success(page to value.tasks.associateBy { it.task.id })
                }

                is Outcome.Failure -> {
                    ranked
                }
            }
        }

        private fun show(
            query: TaskQuery,
            loaded: Pair<TaskPage, Map<String, RankedTask>>,
            counts: TaskSummary?,
            timeZone: String,
            replacing: Boolean,
        ) {
            val (page, ranking) = loaded
            if (replacing) {
                val fresh =
                    TaskList(
                        query = query,
                        tasks = page.tasks,
                        pages = page.pages,
                        total = page.total,
                        summary = counts ?: list?.summary,
                        timeZone = timeZone,
                        loadedAt = clock.instant(),
                        pending = list?.pending.orEmpty(),
                        ranking = ranking,
                    )
                mutableState.value = stateOf(fresh)
            } else {
                update { current ->
                    val known = current.tasks.map { it.id }.toSet()
                    current.copy(
                        query = query,
                        tasks = current.tasks + page.tasks.filterNot { it.id in known },
                        pages = page.pages,
                        total = page.total,
                        isLoadingMore = false,
                        summary = counts ?: current.summary,
                        ranking = current.ranking + ranking,
                    )
                }
            }
        }

        private fun fail(
            error: AppError,
            replacing: Boolean,
        ) {
            when {
                list == null -> mutableState.value = TasksUiState.Failed(error)
                replacing -> update { it.copy(isRefreshing = false, refreshProblem = error) }
                else -> update { it.copy(isLoadingMore = false, moreProblem = error) }
            }
        }

        private suspend fun refreshSummary() {
            val counts = (tasks.summary() as? Outcome.Success)?.value ?: return
            update { it.copy(summary = counts) }
        }

        private suspend fun resolvedTimeZone(): Outcome<String> {
            timeZone?.let { return Outcome.Success(it) }
            return when (val profile = profiles.profile()) {
                is Outcome.Success -> Outcome.Success((profile.value?.timeZone ?: "UTC").also { timeZone = it })
                is Outcome.Failure -> profile
            }
        }

        private fun stateOf(list: TaskList): TasksUiState =
            if (list.tasks.isEmpty()) {
                TasksUiState.Empty(
                    list,
                )
            } else {
                TasksUiState.Content(list)
            }

        private fun update(edit: (TaskList) -> TaskList) {
            val current = list ?: return
            mutableState.value = stateOf(edit(current))
        }

        private companion object {
            val STALE_AFTER: Duration = Duration.ofSeconds(60)
            val SEARCH_PAUSE = 300.milliseconds
        }
    }

private fun stateOf(list: TaskList): TasksUiState = if (list.tasks.isEmpty()) TasksUiState.Empty(list) else TasksUiState.Content(list)
