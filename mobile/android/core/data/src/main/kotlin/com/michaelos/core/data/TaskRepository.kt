package com.michaelos.core.data

import com.michaelos.core.model.Outcome
import com.michaelos.core.model.TaskPage
import com.michaelos.core.network.ApiClient
import com.michaelos.core.network.ApiRequest
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject

interface TaskRepository {
    suspend fun list(page: Int): Outcome<TaskPage>
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
    }

@Module
@InstallIn(SingletonComponent::class)
internal interface DataModule {
    @Binds
    fun taskRepository(repository: RemoteTaskRepository): TaskRepository
}
