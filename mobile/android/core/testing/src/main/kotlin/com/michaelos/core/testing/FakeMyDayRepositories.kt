package com.michaelos.core.testing

import com.michaelos.core.data.HabitRepository
import com.michaelos.core.data.MyDayRepository
import com.michaelos.core.data.TaskRepository
import com.michaelos.core.model.AppError
import com.michaelos.core.model.CheckInResponse
import com.michaelos.core.model.Habit
import com.michaelos.core.model.HabitCheckIn
import com.michaelos.core.model.HabitCreate
import com.michaelos.core.model.HabitResponse
import com.michaelos.core.model.MyDay
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.ServerMessage
import com.michaelos.core.model.Task
import com.michaelos.core.model.TaskCreate
import com.michaelos.core.model.TaskPage
import com.michaelos.core.model.TaskStatus
import com.michaelos.core.model.TaskUpdate
import com.michaelos.core.model.apiJson
import kotlinx.coroutines.CompletableDeferred
import java.time.Instant
import java.time.LocalDate

/** The day from `my-day.json`: three tasks, one habit already checked in, no timeline, today 2026-11-17. */
object MyDayExamples {
    fun day(): MyDay = apiJson.decodeFromString(ContractExamples.example("my-day.json"))
}

/** Answers with [day] unless a failure is queued. A held call waits for its gate before answering. */
class FakeMyDayRepository(
    var day: MyDay,
) : MyDayRepository {
    /** The date each call asked for; null asked for the server's today. */
    val requests = mutableListOf<LocalDate?>()
    private val failures = ArrayDeque<AppError>()
    private var hold: CompletableDeferred<Unit>? = null

    fun failNext(vararg errors: AppError) {
        failures.addAll(errors)
    }

    fun holdNext(gate: CompletableDeferred<Unit>) {
        hold = gate
    }

    override suspend fun day(date: LocalDate?): Outcome<MyDay> {
        requests += date
        hold?.also { hold = null }?.await()
        return failures.removeFirstOrNull()?.let { Outcome.Failure(it) } ?: Outcome.Success(day)
    }
}

/** Saves every update it is sent and answers with the task as saved. */
class FakeTaskRepository(
    tasks: List<Task> = emptyList(),
) : TaskRepository {
    private val tasks = tasks.associateBy { it.id }.toMutableMap()
    val updates = mutableListOf<TaskUpdate>()
    val creates = mutableListOf<TaskCreate>()
    private val failures = ArrayDeque<AppError>()
    private var hold: CompletableDeferred<Unit>? = null

    fun failNext(vararg errors: AppError) {
        failures.addAll(errors)
    }

    fun holdNext(gate: CompletableDeferred<Unit>) {
        hold = gate
    }

    /** The page from `tasks-list.json`; nothing that uses this fake lists tasks. */
    override suspend fun list(
        page: Int,
    ): Outcome<TaskPage> = Outcome.Success(apiJson.decodeFromString(ContractExamples.example("tasks-list.json")))

    override suspend fun update(
        id: String,
        change: TaskUpdate,
    ): Outcome<Task> {
        updates += change
        hold?.also { hold = null }?.await()
        failures.removeFirstOrNull()?.let { return Outcome.Failure(it) }
        val task = tasks[id] ?: return Outcome.Failure(AppError.NotFound(ServerMessage("Task not found.")))
        val now = Instant.now()
        val saved = task.copy(status = change.status, completedAt = now.takeIf { change.status == TaskStatus.Completed }, updatedAt = now)
        tasks[id] = saved
        return Outcome.Success(saved)
    }

    override suspend fun create(task: TaskCreate): Outcome<Task> {
        creates += task
        hold?.also { hold = null }?.await()
        failures.removeFirstOrNull()?.let { return Outcome.Failure(it) }
        val now = Instant.now()
        val created =
            Task(
                id = "task-${creates.size}",
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
        tasks[created.id] = created
        return Outcome.Success(created)
    }
}

class FakeHabitRepository : HabitRepository {
    sealed interface Call {
        data class CheckIn(
            val habitId: String,
            val date: LocalDate,
        ) : Call

        data class Undo(
            val habitId: String,
            val checkInId: String,
        ) : Call

        data class Create(
            val habit: HabitCreate,
        ) : Call
    }

    val calls = mutableListOf<Call>()
    private val failures = ArrayDeque<AppError>()
    private var hold: CompletableDeferred<Unit>? = null

    fun failNext(vararg errors: AppError) {
        failures.addAll(errors)
    }

    fun holdNext(gate: CompletableDeferred<Unit>) {
        hold = gate
    }

    private suspend fun record(call: Call): AppError? {
        calls += call
        hold?.also { hold = null }?.await()
        return failures.removeFirstOrNull()
    }

    override suspend fun checkIn(
        habitId: String,
        date: LocalDate,
    ): Outcome<CheckInResponse> =
        record(Call.CheckIn(habitId, date))?.let { Outcome.Failure(it) }
            ?: Outcome.Success(CheckInResponse(HabitCheckIn("check-in-$habitId", date, Instant.now()), alreadyCompleted = false))

    override suspend fun undoCheckIn(
        habitId: String,
        checkInId: String,
    ): Outcome<Unit> = record(Call.Undo(habitId, checkInId))?.let { Outcome.Failure(it) } ?: Outcome.Success(Unit)

    /** Answers with the habit in `habit-create.json`, whatever was sent. */
    override suspend fun create(habit: HabitCreate): Outcome<Habit> =
        record(Call.Create(habit))?.let { Outcome.Failure(it) }
            ?: Outcome.Success(apiJson.decodeFromString<HabitResponse>(ContractExamples.example("habit-create.json")).habit)
}
