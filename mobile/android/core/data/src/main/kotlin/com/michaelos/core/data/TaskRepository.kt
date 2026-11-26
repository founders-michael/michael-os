package com.michaelos.core.data

import com.michaelos.core.model.Outcome
import com.michaelos.core.model.Task
import com.michaelos.core.model.TaskCreate
import com.michaelos.core.model.TaskDeleted
import com.michaelos.core.model.TaskPage
import com.michaelos.core.model.TaskQuery
import com.michaelos.core.model.TaskResponse
import com.michaelos.core.model.TaskSave
import com.michaelos.core.model.TaskSummary
import com.michaelos.core.model.TaskSummaryResponse
import com.michaelos.core.model.TaskUpdate
import com.michaelos.core.network.ApiClient
import com.michaelos.core.network.ApiRequest
import com.michaelos.core.network.EmptyBody
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

interface TaskRepository {
    suspend fun list(query: TaskQuery): Outcome<TaskPage>

    suspend fun task(id: String): Outcome<Task>

    suspend fun summary(): Outcome<TaskSummary>

    suspend fun update(
        id: String,
        change: TaskUpdate,
    ): Outcome<Task>

    suspend fun create(task: TaskCreate): Outcome<Task>

    /** Creates a task when [id] is null, or saves the task form over an existing one. */
    suspend fun save(
        task: TaskSave,
        id: String?,
    ): Outcome<Task>

    /** Removes the task with its history and planned sessions. */
    suspend fun delete(id: String): Outcome<Unit>

    /** Moves a repeating task to its series' next date. `Conflict` when the series has stopped or the next one exists. */
    suspend fun skip(id: String): Outcome<Task>
}

class RemoteTaskRepository
    @Inject
    constructor(
        private val client: ApiClient,
    ) : TaskRepository {
        override suspend fun list(query: TaskQuery): Outcome<TaskPage> =
            client.send(ApiRequest.get<TaskPage>("/api/tasks", query.parameters)).value()

        override suspend fun task(id: String): Outcome<Task> =
            client.send(ApiRequest.get<TaskResponse>("/api/tasks/$id")).value().map { it.task }

        override suspend fun summary(): Outcome<TaskSummary> =
            client.send(ApiRequest.get<TaskSummaryResponse>("/api/tasks/summary")).value().map { it.summary }

        override suspend fun update(
            id: String,
            change: TaskUpdate,
        ): Outcome<Task> = client.send(ApiRequest.patch<TaskResponse, TaskUpdate>("/api/tasks/$id", change)).value().map { it.task }

        override suspend fun create(task: TaskCreate): Outcome<Task> =
            client.send(ApiRequest.post<TaskResponse, TaskCreate>("/api/tasks", task)).value().map { it.task }

        override suspend fun save(
            task: TaskSave,
            id: String?,
        ): Outcome<Task> {
            val request =
                if (id == null) {
                    ApiRequest.post<TaskResponse, TaskSave>("/api/tasks", task)
                } else {
                    ApiRequest.patch<TaskResponse, TaskSave>("/api/tasks/$id", task)
                }
            return client.send(request).value().map { it.task }
        }

        override suspend fun delete(id: String): Outcome<Unit> =
            client.send(ApiRequest.delete<TaskDeleted>("/api/tasks/$id")).value().map { }

        override suspend fun skip(id: String): Outcome<Task> =
            client.send(ApiRequest.post<TaskResponse, EmptyBody>("/api/tasks/$id/skip", EmptyBody)).value().map { it.task }
    }

/**
 * Moves whenever a screen changes a task, so the other screens that show tasks reload when they are next shown.
 * Tasks, task detail and My Day each have their own view model; this is what they share.
 */
@Singleton
class TaskChanges
    @Inject
    constructor() {
        private val mutableVersion = MutableStateFlow(0)
        val version: StateFlow<Int> = mutableVersion.asStateFlow()

        fun changed() {
            mutableVersion.value += 1
        }
    }

@Module
@InstallIn(SingletonComponent::class)
internal interface DataModule {
    @Binds
    fun taskRepository(repository: RemoteTaskRepository): TaskRepository

    @Binds
    fun taskIntelligenceRepository(repository: RemoteTaskIntelligenceRepository): TaskIntelligenceRepository

    @Binds
    fun authRepository(repository: RemoteAuthRepository): AuthRepository

    @Binds
    fun profileRepository(repository: RemoteProfileRepository): ProfileRepository

    @Binds
    fun myDayRepository(repository: RemoteMyDayRepository): MyDayRepository

    @Binds
    fun habitRepository(repository: RemoteHabitRepository): HabitRepository

    @Binds
    fun assistantRepository(repository: RemoteAssistantRepository): AssistantRepository

    @Binds
    fun goalRepository(repository: RemoteGoalRepository): GoalRepository

    @Binds
    fun calendarRepository(repository: RemoteCalendarRepository): CalendarRepository

    @Binds
    fun memoryRepository(repository: RemoteMemoryRepository): MemoryRepository
}
