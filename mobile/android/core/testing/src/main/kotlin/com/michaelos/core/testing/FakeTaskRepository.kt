package com.michaelos.core.testing

import com.michaelos.core.data.TaskRepository
import com.michaelos.core.model.AppError
import com.michaelos.core.model.FieldChange
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.ServerMessage
import com.michaelos.core.model.Task
import com.michaelos.core.model.TaskCreate
import com.michaelos.core.model.TaskPage
import com.michaelos.core.model.TaskPriority
import com.michaelos.core.model.TaskQuery
import com.michaelos.core.model.TaskRecurrence
import com.michaelos.core.model.TaskSave
import com.michaelos.core.model.TaskStatus
import com.michaelos.core.model.TaskSummary
import com.michaelos.core.model.TaskUpdate
import com.michaelos.core.model.TaskView
import kotlinx.coroutines.CompletableDeferred
import java.time.Instant
import java.time.LocalDate

/**
 * Holds a list of tasks and answers as the server would: filtered, paged, saved. A queued failure answers the next
 * call; a held call waits for its gate. Without [today] no task counts as overdue and the summary fails.
 */
@Suppress("TooManyFunctions") // The eight calls of TaskRepository plus the controls a test needs.
class FakeTaskRepository(
    tasks: List<Task> = emptyList(),
    private val today: LocalDate? = null,
) : TaskRepository {
    sealed interface Call {
        data class List(
            val query: TaskQuery,
        ) : Call

        data class Get(
            val id: String,
        ) : Call

        data object Summary : Call

        data class Update(
            val id: String,
            val change: TaskUpdate,
        ) : Call

        data class Create(
            val task: TaskCreate,
        ) : Call

        data class Save(
            val task: TaskSave,
            val id: String?,
        ) : Call

        data class Delete(
            val id: String,
        ) : Call

        data class Skip(
            val id: String,
        ) : Call
    }

    private val stored = tasks.toMutableList()
    private val failures = ArrayDeque<AppError>()
    private var hold: CompletableDeferred<Unit>? = null
    private var created = 0
    val calls = mutableListOf<Call>()

    val tasks: List<Task> get() = stored.toList()
    val updates: List<TaskUpdate> get() = calls.filterIsInstance<Call.Update>().map { it.change }
    val creates: List<TaskCreate> get() = calls.filterIsInstance<Call.Create>().map { it.task }
    val lists: List<TaskQuery> get() = calls.filterIsInstance<Call.List>().map { it.query }

    fun failNext(vararg errors: AppError) {
        failures.addAll(errors)
    }

    fun holdNext(gate: CompletableDeferred<Unit>) {
        hold = gate
    }

    /** Changes a task as another device would. */
    fun replace(task: Task) {
        val index = stored.indexOfFirst { it.id == task.id }
        if (index >= 0) stored[index] = task
    }

    override suspend fun list(query: TaskQuery): Outcome<TaskPage> =
        answer(Call.List(query)) {
            val term = query.search.trim().lowercase()
            val matching =
                stored.filter { task ->
                    val inView =
                        when (query.view) {
                            TaskView.All -> true
                            TaskView.Pending -> task.status != TaskStatus.Completed
                            TaskView.Completed -> task.status == TaskStatus.Completed
                            TaskView.Overdue -> task.status != TaskStatus.Completed && task.isOverdueOn(today)
                        }
                    inView && (query.priority == null || query.priority == task.priority) &&
                        (term.isEmpty() || task.title.lowercase().contains(term))
                }
            val size = TaskQuery.PAGE_SIZE
            val pages = maxOf(1, (matching.size + size - 1) / size)
            Outcome.Success(TaskPage(matching.drop((query.page - 1) * size).take(size), query.page, size, matching.size, pages))
        }

    override suspend fun task(id: String): Outcome<Task> = answer(Call.Get(id)) { find(id) }

    override suspend fun summary(): Outcome<TaskSummary> =
        answer(Call.Summary) {
            val day = today ?: return@answer Outcome.Failure(AppError.Server(ServerMessage("Pass `today` to the fake.")))
            val open = stored.filter { it.status != TaskStatus.Completed }
            Outcome.Success(
                TaskSummary(
                    dueToday = open.count { it.dueDate == day },
                    outstanding = open.size,
                    completed = stored.size - open.size,
                    overdue = open.count { it.isOverdueOn(today) },
                    today = day,
                ),
            )
        }

    override suspend fun update(
        id: String,
        change: TaskUpdate,
    ): Outcome<Task> =
        answer(Call.Update(id, change)) {
            when (val found = find(id)) {
                is Outcome.Success -> Outcome.Success(found.value.withStatus(change.status).also(::store))
                is Outcome.Failure -> found
            }
        }

    override suspend fun create(task: TaskCreate): Outcome<Task> =
        answer(Call.Create(task)) {
            created += 1
            val now = Instant.now()
            val saved =
                Task(
                    id = "task-$created",
                    title = task.title,
                    description = task.description,
                    status = TaskStatus.Todo,
                    priority = task.priority,
                    estimatedDurationMinutes = task.estimatedDurationMinutes,
                    remainingDurationMinutes = task.estimatedDurationMinutes,
                    dueDate = task.dueDate,
                    createdAt = now,
                    updatedAt = now,
                )
            stored.add(0, saved)
            Outcome.Success(saved)
        }

    override suspend fun save(
        task: TaskSave,
        id: String?,
    ): Outcome<Task> =
        answer(Call.Save(task, id)) {
            val existing = id?.let { stored.firstOrNull { it.id == id } ?: return@answer notFound() }
            if (existing == null) created += 1
            val now = Instant.now()
            val recurrence = recurrenceAfter(task, existing)
            val remindAt = remindAtAfter(task, existing)
            val saved =
                Task(
                    id = existing?.id ?: "task-$created",
                    title = task.title,
                    description = task.description,
                    status = existing?.status ?: TaskStatus.Todo,
                    priority = task.priority,
                    estimatedDurationMinutes = task.estimatedDurationMinutes,
                    remainingDurationMinutes = task.remainingDurationMinutes,
                    dueDate = task.dueDate,
                    completedAt = existing?.completedAt,
                    createdAt = existing?.createdAt ?: now,
                    updatedAt = now,
                    recurrence = recurrence,
                    remindAt = remindAt,
                    reminderSent = task.reminder == null && existing?.reminderSent == true,
                )
            if (existing == null) stored.add(0, saved) else store(saved)
            Outcome.Success(saved)
        }

    override suspend fun delete(id: String): Outcome<Unit> =
        answer(Call.Delete(id)) {
            if (stored.removeAll { it.id == id }) Outcome.Success(Unit) else notFound()
        }

    override suspend fun skip(id: String): Outcome<Task> =
        answer(Call.Skip(id)) {
            when (val found = find(id)) {
                is Outcome.Failure -> {
                    found
                }

                is Outcome.Success -> {
                    if (found.value.activeRecurrence == null) {
                        Outcome.Failure(
                            AppError.Conflict(
                                ServerMessage("This task no longer repeats, so there is no next date to skip to.", "SERIES_STOPPED"),
                            ),
                        )
                    } else {
                        Outcome.Success(found.value.copy(dueDate = found.value.dueDate?.plusDays(SKIP_DAYS)).also(::store))
                    }
                }
            }
        }

    private suspend fun <T> answer(
        call: Call,
        body: () -> Outcome<T>,
    ): Outcome<T> {
        calls += call
        hold?.also { hold = null }?.await()
        failures.removeFirstOrNull()?.let { return Outcome.Failure(it) }
        return body()
    }

    private fun find(id: String): Outcome<Task> = stored.firstOrNull { it.id == id }?.let { Outcome.Success(it) } ?: notFound()

    private fun store(task: Task) {
        val index = stored.indexOfFirst { it.id == task.id }
        if (index >= 0) stored[index] = task
    }
}

private const val SKIP_DAYS = 7L
private const val SAVED_REMINDER_SECONDS = 1_800_000_000L

private fun Task.isOverdueOn(today: LocalDate?): Boolean = today != null && dueDate?.isBefore(today) == true

private fun <T> notFound(): Outcome<T> = Outcome.Failure(AppError.NotFound(ServerMessage("Task not found.")))

private fun recurrenceAfter(
    task: TaskSave,
    existing: Task?,
): TaskRecurrence? =
    when (val change = task.recurrence) {
        is FieldChange.Set -> {
            change.value.let {
                TaskRecurrence(
                    it.frequency,
                    it.interval,
                    it.weekdays,
                    it.monthDay,
                    it.endsOn,
                    true,
                    "Repeats",
                )
            }
        }

        FieldChange.Clear -> {
            existing?.recurrence?.copy(active = false)
        }

        null -> {
            existing?.recurrence
        }
    }

private fun remindAtAfter(
    task: TaskSave,
    existing: Task?,
): Instant? =
    when (task.reminder) {
        is FieldChange.Set -> Instant.ofEpochSecond(SAVED_REMINDER_SECONDS)
        FieldChange.Clear -> null
        null -> existing?.remindAt
    }

fun Task.withStatus(status: TaskStatus): Task {
    val now = Instant.now()
    return copy(status = status, completedAt = now.takeIf { status == TaskStatus.Completed }, updatedAt = now)
}

/** A task with the fields a test usually does not care about filled in. */
fun task(
    id: String,
    title: String = "Task $id",
    status: TaskStatus = TaskStatus.Todo,
    priority: TaskPriority = TaskPriority.Medium,
    due: String? = null,
    recurrence: TaskRecurrence? = null,
    remindAt: Instant? = null,
    reminderSent: Boolean = false,
): Task =
    Task(
        id = id,
        title = title,
        status = status,
        priority = priority,
        estimatedDurationMinutes = 30,
        dueDate = due?.let(LocalDate::parse),
        createdAt = Instant.EPOCH,
        updatedAt = Instant.EPOCH,
        recurrence = recurrence,
        remindAt = remindAt,
        reminderSent = reminderSent,
    )
