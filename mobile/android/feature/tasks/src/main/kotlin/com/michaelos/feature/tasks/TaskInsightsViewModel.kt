package com.michaelos.feature.tasks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.michaelos.core.data.TaskIntelligenceRepository
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Classification
import com.michaelos.core.model.Goal
import com.michaelos.core.model.GoalLink
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.TaxonomyCategory
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class TaskInsights(
    val linked: List<GoalLink>? = null,
    val activeGoals: List<Goal> = emptyList(),
    val classifications: List<Classification>? = null,
    val catalog: List<TaxonomyCategory> = emptyList(),
    val busy: Busy? = null,
    val problem: AppError? = null,
    /** Michael found no category that clearly fits. */
    val noSuggestion: Boolean = false,
    /** The server asked for the data-use acknowledgement before suggesting. */
    val needsAcknowledgement: Boolean = false,
) {
    sealed interface Busy {
        data object Goals : Busy

        data object Suggest : Busy

        data object Add : Busy

        data class Row(
            val id: String,
        ) : Busy
    }

    /** Goals to offer: the active ones, then any linked goal no longer active, so it can still be unlinked. */
    val goalChoices: List<GoalLink>
        get() {
            val active = activeGoals.map { GoalLink(it.id, it.title, it.status, it.targetDate) }
            val ids = active.map { it.id }.toSet()
            return active + linked.orEmpty().filterNot { it.id in ids }
        }

    val confirmed: List<Classification> get() = classifications.orEmpty().filterNot { it.inferred }

    /** A suggestion the user already confirmed shows once, as theirs. */
    val suggestions: List<Classification>
        get() {
            val keys = confirmed.map { it.category.key }.toSet()
            return classifications.orEmpty().filter { it.inferred && it.category.key !in keys }
        }

    val addable: List<TaxonomyCategory>
        get() {
            val keys = confirmed.map { it.category.key }.toSet()
            return catalog.filterNot { it.key in keys }
        }

    fun isLinked(goal: GoalLink): Boolean = linked.orEmpty().any { it.id == goal.id }

    fun canLink(goal: GoalLink): Boolean = isLinked(goal) || linked.orEmpty().size < GOAL_LIMIT

    companion object {
        const val GOAL_LIMIT = 5
    }
}

/**
 * The goals a task supports and its categories, on the task's detail screen. None of these writes is optimistic: the
 * server may refuse a link, and a suggestion is computed there, so each waits for the answer (root `CLAUDE.md` 9.5).
 */
@HiltViewModel(assistedFactory = TaskInsightsViewModel.Factory::class)
class TaskInsightsViewModel
    @AssistedInject
    constructor(
        @Assisted val taskId: String,
        private val intelligence: TaskIntelligenceRepository,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(TaskInsights())
        val uiState: StateFlow<TaskInsights> = mutableState.asStateFlow()

        init {
            load()
        }

        fun load() {
            viewModelScope.launch {
                val links = async { intelligence.goalLinks(taskId) }
                val goals = async { intelligence.activeGoals() }
                val rows = async { intelligence.classifications(taskId) }
                val categories = async { intelligence.categories() }
                val classifications = rows.await()
                mutableState.value =
                    mutableState.value.copy(
                        linked = (links.await() as? Outcome.Success)?.value.orEmpty(),
                        activeGoals = (goals.await() as? Outcome.Success)?.value.orEmpty(),
                        classifications = (classifications as? Outcome.Success)?.value.orEmpty(),
                        catalog = (categories.await() as? Outcome.Success)?.value.orEmpty(),
                        problem = (classifications as? Outcome.Failure)?.error,
                    )
            }
        }

        fun toggle(goal: GoalLink) {
            val state = mutableState.value
            if (state.busy != null || state.linked == null || !state.canLink(goal)) return
            val next =
                if (state.isLinked(goal)) {
                    state.linked.filterNot { it.id == goal.id }.map { it.id }
                } else {
                    state.linked.map { it.id } +
                        goal.id
                }
            perform(TaskInsights.Busy.Goals, { intelligence.setGoalLinks(taskId, next) }) { copy(linked = it) }
        }

        fun classify(category: TaxonomyCategory) =
            perform(TaskInsights.Busy.Add, { intelligence.classify(taskId, category.key) }) {
                copy(classifications = classifications.orEmpty() + it)
            }

        fun remove(row: Classification) =
            perform(TaskInsights.Busy.Row(row.id), { intelligence.removeClassification(row.id) }) {
                copy(classifications = classifications?.filterNot { it.id == row.id })
            }

        fun confirm(row: Classification) =
            perform(TaskInsights.Busy.Row(row.id), { intelligence.confirm(row.id) }) {
                copy(classifications = classifications.orEmpty() + it)
            }

        fun suggest(acknowledged: Boolean = false) {
            if (mutableState.value.busy != null) return
            mutableState.value = mutableState.value.copy(busy = TaskInsights.Busy.Suggest, problem = null, noSuggestion = false)
            viewModelScope.launch {
                val outcome = intelligence.suggest(taskId, acknowledged)
                val state = mutableState.value.copy(busy = null)
                mutableState.value =
                    when (outcome) {
                        is Outcome.Success -> {
                            val suggestion = outcome.value
                            if (suggestion == null) {
                                state.copy(noSuggestion = true, needsAcknowledgement = false)
                            } else {
                                state.copy(classifications = state.classifications.orEmpty() + suggestion, needsAcknowledgement = false)
                            }
                        }

                        is Outcome.Failure -> {
                            val asks = (outcome.error as? AppError.Validation)?.server?.code == DATA_USE
                            if (asks) state.copy(needsAcknowledgement = true) else state.copy(problem = outcome.error)
                        }
                    }
            }
        }

        fun declineAcknowledgement() {
            mutableState.value = mutableState.value.copy(needsAcknowledgement = false)
        }

        private fun <T> perform(
            busy: TaskInsights.Busy,
            write: suspend () -> Outcome<T>,
            apply: TaskInsights.(T) -> TaskInsights,
        ) {
            if (mutableState.value.busy != null) return
            mutableState.value = mutableState.value.copy(busy = busy, problem = null)
            viewModelScope.launch {
                val outcome = write()
                val state = mutableState.value.copy(busy = null)
                mutableState.value =
                    when (outcome) {
                        is Outcome.Success -> state.apply(outcome.value)
                        is Outcome.Failure -> state.copy(problem = outcome.error)
                    }
            }
        }

        @AssistedFactory
        interface Factory {
            fun create(taskId: String): TaskInsightsViewModel
        }

        private companion object {
            const val DATA_USE = "DATA_USE_ACKNOWLEDGEMENT_REQUIRED"
        }
    }
