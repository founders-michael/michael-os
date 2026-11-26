package com.michaelos.feature.tasks

import com.michaelos.core.data.TaskChanges
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Classification
import com.michaelos.core.model.Goal
import com.michaelos.core.model.GoalList
import com.michaelos.core.model.PrioritiesPage
import com.michaelos.core.model.ProfileResponse
import com.michaelos.core.model.ServerMessage
import com.michaelos.core.model.TaskSort
import com.michaelos.core.model.apiJson
import com.michaelos.core.testing.ContractExamples
import com.michaelos.core.testing.FakeProfileRepository
import com.michaelos.core.testing.FakeTaskIntelligenceRepository
import com.michaelos.core.testing.FakeTaskRepository
import com.michaelos.core.testing.MainDispatcherRule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

class TaskIntelligenceTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val goal = apiJson.decodeFromString<GoalList>(ContractExamples.example("goals-active.json")).goals.first()

    private fun goals(count: Int): List<Goal> = (1..count).map { goal.copy(id = "g$it", title = "Goal $it") }

    @Test
    fun michaelsOrderDecodesWithItsReasons() {
        val first = apiJson.decodeFromString<PrioritiesPage>(ContractExamples.example("tasks-priorities.json")).tasks.first()
        assertEquals("Send the investor update", first.task.title)
        val overdue = first.components.first { it.name == "due_proximity" }.reason
        assertEquals("OVERDUE", overdue.code)
        assertEquals(5.0, overdue.numbers["days"])
        assertEquals(
            "high",
            first.components
                .first { it.name == "user_priority" }
                .reason.strings["priority"],
        )
        assertNull(first.components.first { it.name == "blocking_impact" }.contribution)
    }

    @Test
    fun michaelsOrderReadsThePrioritiesAndKeepsEachRanking() {
        val tasks = FakeTaskRepository(today = LocalDate.parse("2026-11-17"))
        val intelligence = FakeTaskIntelligenceRepository()
        val profile = apiJson.decodeFromString<ProfileResponse>(ContractExamples.example("profile-get.json")).profile
        val model =
            TasksViewModel(tasks, intelligence, FakeProfileRepository(profile), TaskChanges(), Clock.fixed(Instant.EPOCH, ZoneOffset.UTC))
        model.select(TaskSort.Michael)
        assertEquals(listOf("priorities 1"), intelligence.calls)
        assertEquals(
            "Send the investor update",
            model.list
                ?.tasks
                ?.first()
                ?.title,
        )
        assertEquals(
            1,
            model.list
                ?.ranking
                ?.values
                ?.minOf { it.rank },
        )
        assertTrue(tasks.lists.none { it.sort == TaskSort.Michael })
    }

    @Test
    fun goalsLinkUpToFiveAndARefusalKeepsTheServersLinks() {
        val intelligence = FakeTaskIntelligenceRepository(goals(6))
        val model = TaskInsightsViewModel("a", intelligence)
        model.uiState.value.goalChoices
            .take(5)
            .forEach(model::toggle)
        assertEquals(
            5,
            model.uiState.value.linked
                ?.size,
        )
        val sixth =
            model.uiState.value.goalChoices
                .last()
        assertFalse(model.uiState.value.canLink(sixth))
        model.toggle(sixth)
        assertEquals(
            5,
            model.uiState.value.linked
                ?.size,
        )
        intelligence.failNext(AppError.Validation(ServerMessage("Link a task to at most 5 goals."), mapOf("goalIds" to listOf("Too many"))))
        model.toggle(
            model.uiState.value.goalChoices
                .first(),
        )
        assertEquals(
            5,
            model.uiState.value.linked
                ?.size,
        )
        assertTrue(model.uiState.value.problem != null)
    }

    @Test
    fun aSuggestionStaysOneUntilConfirmed() {
        val suggestion =
            Classification("s1", Classification.Category("personal.finance", "Personal finance"), inferred = true, confidence = 0.82)
        val model = TaskInsightsViewModel("a", FakeTaskIntelligenceRepository(suggestion = suggestion))
        model.suggest()
        assertEquals(
            listOf("s1"),
            model.uiState.value.suggestions
                .map { it.id },
        )
        model.confirm(suggestion)
        assertTrue(
            model.uiState.value.suggestions
                .isEmpty(),
        )
        assertEquals(
            listOf("personal.finance"),
            model.uiState.value.confirmed
                .map { it.category.key },
        )
    }

    @Test
    fun theDataUseNoticeAsksBeforeSuggestingAndNoFitSaysSo() {
        val intelligence = FakeTaskIntelligenceRepository()
        val model = TaskInsightsViewModel("a", intelligence)
        intelligence.failNext(AppError.Validation(ServerMessage("Confirm.", "DATA_USE_ACKNOWLEDGEMENT_REQUIRED"), emptyMap()))
        model.suggest()
        assertTrue(model.uiState.value.needsAcknowledgement)
        assertNull(model.uiState.value.problem)
        model.suggest(acknowledged = true)
        assertFalse(model.uiState.value.needsAcknowledgement)
        assertTrue(model.uiState.value.noSuggestion)
        assertEquals(listOf("suggest false", "suggest true"), intelligence.calls.filter { it.startsWith("suggest") })
    }

    @Test
    fun categoriesAreAddedAndRemovedAndTheMenuOffersTheRest() {
        val model = TaskInsightsViewModel("a", FakeTaskIntelligenceRepository())
        val count = model.uiState.value.addable.size
        model.classify(
            model.uiState.value.addable
                .first(),
        )
        assertEquals(1, model.uiState.value.confirmed.size)
        assertEquals(count - 1, model.uiState.value.addable.size)
        model.remove(
            model.uiState.value.confirmed
                .first(),
        )
        assertTrue(
            model.uiState.value.confirmed
                .isEmpty(),
        )
    }
}
