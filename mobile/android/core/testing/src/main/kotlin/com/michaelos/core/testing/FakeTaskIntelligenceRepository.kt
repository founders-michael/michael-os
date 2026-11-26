package com.michaelos.core.testing

import com.michaelos.core.data.TaskIntelligenceRepository
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Classification
import com.michaelos.core.model.Goal
import com.michaelos.core.model.GoalLink
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.PrioritiesPage
import com.michaelos.core.model.TaxonomyCategory
import com.michaelos.core.model.TaxonomyResponse
import com.michaelos.core.model.apiJson

/** Answers from the saved examples, then from what the test changed. A queued failure answers the next call. */
@Suppress("TooManyFunctions") // The ten calls of TaskIntelligenceRepository plus a failure queue.
class FakeTaskIntelligenceRepository(
    private val goals: List<Goal> = emptyList(),
    private val suggestion: Classification? = null,
) : TaskIntelligenceRepository {
    val calls = mutableListOf<String>()
    private val failures = ArrayDeque<AppError>()
    private var linked = listOf<GoalLink>()
    private val rows = mutableListOf<Classification>()

    fun failNext(vararg errors: AppError) {
        failures.addAll(errors)
    }

    override suspend fun priorities(page: Int): Outcome<PrioritiesPage> =
        answer("priorities $page") { apiJson.decodeFromString(ContractExamples.example("tasks-priorities.json")) }

    override suspend fun goalLinks(taskId: String): Outcome<List<GoalLink>> = answer("goalLinks") { linked }

    override suspend fun setGoalLinks(
        taskId: String,
        goalIds: List<String>,
    ): Outcome<List<GoalLink>> =
        answer("setGoalLinks $goalIds") {
            linked = goals.filter { it.id in goalIds }.map { GoalLink(it.id, it.title, it.status, it.targetDate) }
            linked
        }

    override suspend fun activeGoals(): Outcome<List<Goal>> = answer("activeGoals") { goals }

    override suspend fun categories(): Outcome<List<TaxonomyCategory>> =
        answer("categories") {
            apiJson.decodeFromString<TaxonomyResponse>(ContractExamples.example("taxonomy-lifestyle.json")).categories.filter {
                "TASK" in
                    it.entityTypes
            }
        }

    override suspend fun classifications(taskId: String): Outcome<List<Classification>> = answer("classifications") { rows.toList() }

    override suspend fun classify(
        taskId: String,
        categoryKey: String,
    ): Outcome<Classification> =
        answer("classify $categoryKey") {
            Classification("c${rows.size + 1}", Classification.Category(categoryKey, categoryKey), inferred = false).also { rows += it }
        }

    override suspend fun removeClassification(id: String): Outcome<Unit> = answer("remove $id") { rows.removeAll { it.id == id } }.map { }

    override suspend fun suggest(
        taskId: String,
        dataUseAcknowledged: Boolean,
    ): Outcome<Classification?> = answer("suggest $dataUseAcknowledged") { suggestion?.also { rows += it } }

    override suspend fun confirm(id: String): Outcome<Classification> =
        answer("confirm $id") {
            val category = rows.firstOrNull { it.id == id }?.category ?: Classification.Category(id, id)
            Classification("$id-confirmed", category, inferred = false).also { rows += it }
        }

    private fun <T> answer(
        call: String,
        body: () -> T,
    ): Outcome<T> {
        calls += call
        failures.removeFirstOrNull()?.let { return Outcome.Failure(it) }
        return Outcome.Success(body())
    }
}

private fun <T, R> Outcome<T>.map(transform: (T) -> R): Outcome<R> =
    when (this) {
        is Outcome.Success -> Outcome.Success(transform(value))
        is Outcome.Failure -> this
    }
