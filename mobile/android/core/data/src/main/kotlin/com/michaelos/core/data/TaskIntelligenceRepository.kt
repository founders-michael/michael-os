package com.michaelos.core.data

import com.michaelos.core.model.Classification
import com.michaelos.core.model.ClassificationCreate
import com.michaelos.core.model.ClassificationList
import com.michaelos.core.model.ClassificationResponse
import com.michaelos.core.model.Goal
import com.michaelos.core.model.GoalLink
import com.michaelos.core.model.GoalLinks
import com.michaelos.core.model.GoalLinksUpdate
import com.michaelos.core.model.GoalList
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.PrioritiesPage
import com.michaelos.core.model.SuggestionRequest
import com.michaelos.core.model.SuggestionResponse
import com.michaelos.core.model.TaxonomyCategory
import com.michaelos.core.model.TaxonomyResponse
import com.michaelos.core.network.ApiClient
import com.michaelos.core.network.ApiRequest
import com.michaelos.core.network.EmptyBody
import com.michaelos.core.network.NoContent
import javax.inject.Inject

/** Michael's order, the goals a task supports, and its categories. */
interface TaskIntelligenceRepository {
    suspend fun priorities(page: Int): Outcome<PrioritiesPage>

    suspend fun goalLinks(taskId: String): Outcome<List<GoalLink>>

    /** Replaces the set of goals the task supports (at most five). */
    suspend fun setGoalLinks(
        taskId: String,
        goalIds: List<String>,
    ): Outcome<List<GoalLink>>

    suspend fun activeGoals(): Outcome<List<Goal>>

    suspend fun categories(): Outcome<List<TaxonomyCategory>>

    suspend fun classifications(taskId: String): Outcome<List<Classification>>

    suspend fun classify(
        taskId: String,
        categoryKey: String,
    ): Outcome<Classification>

    /** Removes a category, or dismisses a suggestion. */
    suspend fun removeClassification(id: String): Outcome<Unit>

    /**
     * Null when Michael found no category that clearly fits. `Validation` with `DATA_USE_ACKNOWLEDGEMENT_REQUIRED` under
     * Gemini's unpaid tier.
     */
    suspend fun suggest(
        taskId: String,
        dataUseAcknowledged: Boolean,
    ): Outcome<Classification?>

    suspend fun confirm(id: String): Outcome<Classification>
}

class RemoteTaskIntelligenceRepository
    @Inject
    constructor(
        private val client: ApiClient,
    ) : TaskIntelligenceRepository {
        override suspend fun priorities(page: Int): Outcome<PrioritiesPage> =
            client
                .send(
                    ApiRequest.get<PrioritiesPage>("/api/tasks/priorities", listOf("page" to page.toString(), "limit" to PAGE_SIZE)),
                ).value()

        override suspend fun goalLinks(taskId: String): Outcome<List<GoalLink>> =
            client.send(ApiRequest.get<GoalLinks>("/api/tasks/$taskId/goals")).value().map { it.goals }

        override suspend fun setGoalLinks(
            taskId: String,
            goalIds: List<String>,
        ): Outcome<List<GoalLink>> =
            client
                .send(
                    ApiRequest.put<GoalLinks, GoalLinksUpdate>("/api/tasks/$taskId/goals", GoalLinksUpdate(goalIds)),
                ).value()
                .map { it.goals }

        override suspend fun activeGoals(): Outcome<List<Goal>> =
            client
                .send(
                    ApiRequest.get<GoalList>("/api/goals", listOf("status" to "ACTIVE", "sort" to "targetDate")),
                ).value()
                .map { it.goals }

        override suspend fun categories(): Outcome<List<TaxonomyCategory>> =
            client
                .send(ApiRequest.get<TaxonomyResponse>("/api/taxonomy", listOf("product" to "lifestyle", "limit" to "200")))
                .value()
                .map { response -> response.categories.filter { TASK in it.entityTypes } }

        override suspend fun classifications(taskId: String): Outcome<List<Classification>> =
            client
                .send(ApiRequest.get<ClassificationList>(BASE, listOf("entityType" to TASK, "entityId" to taskId, "limit" to "50")))
                .value()
                .map { it.classifications }

        override suspend fun classify(
            taskId: String,
            categoryKey: String,
        ): Outcome<Classification> =
            client
                .send(
                    ApiRequest.post<ClassificationResponse, ClassificationCreate>(BASE, ClassificationCreate(taskId, categoryKey)),
                ).value()
                .map {
                    it.classification
                }

        override suspend fun removeClassification(id: String): Outcome<Unit> =
            client
                .send(
                    ApiRequest.delete<NoContent>("$BASE/$id"),
                ).value()
                .map {
                }

        override suspend fun suggest(
            taskId: String,
            dataUseAcknowledged: Boolean,
        ): Outcome<Classification?> =
            client
                .send(
                    ApiRequest.post<SuggestionResponse, SuggestionRequest>("$BASE/suggest", SuggestionRequest(taskId, dataUseAcknowledged)),
                ).value()
                .map { it.suggestion }

        override suspend fun confirm(id: String): Outcome<Classification> =
            client
                .send(
                    ApiRequest.post<ClassificationResponse, EmptyBody>("$BASE/$id/confirm", EmptyBody),
                ).value()
                .map { it.classification }

        private companion object {
            const val BASE = "/api/lifestyle/classifications"
            const val TASK = "TASK"
            const val PAGE_SIZE = "30"
        }
    }
