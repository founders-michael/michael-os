package com.michaelos.core.data

import com.michaelos.core.model.Outcome
import com.michaelos.core.model.Task
import com.michaelos.core.model.TaskCreate
import com.michaelos.core.model.TaskPage
import com.michaelos.core.model.TaskResponse
import com.michaelos.core.model.TaskUpdate
import com.michaelos.core.network.ApiClient
import com.michaelos.core.network.ApiRequest
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject

interface TaskRepository {
    suspend fun list(page: Int): Outcome<TaskPage>

    suspend fun update(
        id: String,
        change: TaskUpdate,
    ): Outcome<Task>

    suspend fun create(task: TaskCreate): Outcome<Task>
}

class RemoteTaskRepository
    @Inject
    constructor(
        private val client: ApiClient,
    ) : TaskRepository {
        override suspend fun list(page: Int): Outcome<TaskPage> =
            when (val outcome = client.send(ApiRequest.get<TaskPage>("/api/tasks", listOf("page" to page.toString())))) {
                is Outcome.Success -> Outcome.Success(outcome.value.value)
                is Outcome.Failure -> outcome
            }

        override suspend fun update(
            id: String,
            change: TaskUpdate,
        ): Outcome<Task> =
            when (val outcome = client.send(ApiRequest.patch<TaskResponse, TaskUpdate>("/api/tasks/$id", change))) {
                is Outcome.Success -> Outcome.Success(outcome.value.value.task)
                is Outcome.Failure -> outcome
            }

        override suspend fun create(task: TaskCreate): Outcome<Task> =
            client.send(ApiRequest.post<TaskResponse, TaskCreate>("/api/tasks", task)).value().map { it.task }
    }

@Module
@InstallIn(SingletonComponent::class)
internal interface DataModule {
    @Binds
    fun taskRepository(repository: RemoteTaskRepository): TaskRepository

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
