package com.michaelos.feature.tasks

import com.michaelos.core.data.TaskChanges
import com.michaelos.core.model.AppError
import com.michaelos.core.model.FieldChange
import com.michaelos.core.model.ProfileResponse
import com.michaelos.core.model.RecurrenceFrequency
import com.michaelos.core.model.ServerMessage
import com.michaelos.core.model.TaskPriority
import com.michaelos.core.model.TaskQuery
import com.michaelos.core.model.TaskRecurrence
import com.michaelos.core.model.TaskStatus
import com.michaelos.core.model.TaskUpdate
import com.michaelos.core.model.TaskView
import com.michaelos.core.model.apiJson
import com.michaelos.core.testing.ContractExamples
import com.michaelos.core.testing.FakeProfileRepository
import com.michaelos.core.testing.FakeTaskRepository
import com.michaelos.core.testing.MainDispatcherRule
import com.michaelos.core.testing.task
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

@OptIn(ExperimentalCoroutinesApi::class)
class TasksViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val today = LocalDate.parse("2026-11-17")
    private val changes = TaskChanges()
    private val weekly = TaskRecurrence(RecurrenceFrequency.Weekly, 1, listOf(2), null, null, true, "Every Tue")

    private fun profiles() =
        FakeProfileRepository(
            apiJson.decodeFromString<ProfileResponse>(ContractExamples.example("profile-get.json")).profile,
        )

    private fun model(tasks: FakeTaskRepository) = TasksViewModel(tasks, profiles(), changes, Clock.fixed(Instant.EPOCH, ZoneOffset.UTC))

    @Test
    fun theFirstLoadShowsThePageTheCountsAndTheProfileZone() {
        val tasks = FakeTaskRepository(listOf(task("a", due = "2026-11-10"), task("b")), today)
        val list = checkNotNull(model(tasks).list)
        assertEquals(listOf("a", "b"), list.tasks.map { it.id })
        assertEquals(1, list.summary?.overdue)
        assertEquals("Asia/Kolkata", list.timeZone)
        assertEquals(listOf(TaskQuery()), tasks.lists)
    }

    @Test
    fun noTasksIsEmptyAndAFailureWithNothingShownFailsTheScreen() {
        assertTrue(model(FakeTaskRepository(today = today)).uiState.value is TasksUiState.Empty)
        val failing = FakeTaskRepository(today = today).apply { failNext(AppError.Offline, AppError.Offline) }
        val model = model(failing)
        assertTrue(model.uiState.value is TasksUiState.Failed)
        model.load()
        assertTrue(model.uiState.value is TasksUiState.Empty)
    }

    @Test
    fun filtersStartAgainFromPageOne() {
        val tasks = FakeTaskRepository(listOf(task("a", priority = TaskPriority.High), task("b", status = TaskStatus.Completed)), today)
        val model = model(tasks)
        model.select(TaskView.Completed)
        assertEquals(listOf("b"), model.list?.tasks?.map { it.id })
        model.select(TaskView.All)
        model.select(TaskPriority.High)
        assertEquals(listOf("a"), model.list?.tasks?.map { it.id })
        assertEquals(TaskQuery(priority = TaskPriority.High), tasks.lists.last())
    }

    @Test
    fun pagesLoadThirtyAtATimeAndALaterFailureKeepsWhatIsShown() {
        val tasks = FakeTaskRepository((1..45).map { task("t$it") }, today)
        val model = model(tasks)
        assertEquals(30, model.list?.tasks?.size)
        tasks.failNext(AppError.Offline, AppError.Offline)
        model.loadMore()
        assertEquals(30, model.list?.tasks?.size)
        assertEquals(AppError.Offline, model.list?.moreProblem)
        model.loadMore()
        assertEquals(45, model.list?.tasks?.size)
        assertEquals(false, model.list?.canLoadMore)
    }

    @Test
    fun searchWaitsForAPauseAndOnlyTheLastSearchIsSent() =
        runTest(main.dispatcher) {
            val tasks =
                FakeTaskRepository(listOf(task("a", title = "Send the investor update"), task("b", title = "Book the dentist")), today)
            val model = model(tasks)
            model.search("inv")
            advanceTimeBy(100)
            model.search("dent")
            advanceTimeBy(400)
            runCurrent()
            assertEquals(listOf("", "dent"), tasks.lists.map { it.search })
            assertEquals(listOf("b"), model.list?.tasks?.map { it.id })
        }

    @Test
    fun aRefusedToggleRollsBackAndSaysWhy() {
        val tasks = FakeTaskRepository(listOf(task("a")), today)
        val model = model(tasks)
        tasks.failNext(AppError.Forbidden(ServerMessage("You cannot change this task.")))
        model.toggle("a")
        assertEquals(
            TaskStatus.Todo,
            model.list
                ?.tasks
                ?.first()
                ?.status,
        )
        assertTrue(model.list?.pending?.isEmpty() == true)
        assertEquals(
            true,
            model.list
                ?.rollbacks
                ?.get("a")
                ?.completing,
        )
    }

    @Test
    fun rapidTogglingEndsInTheStateChosenLast() {
        val tasks = FakeTaskRepository(listOf(task("a")), today)
        val model = model(tasks)
        val gate = CompletableDeferred<Unit>()
        tasks.holdNext(gate)
        model.toggle("a")
        assertEquals(TaskStatus.Completed, model.list?.let { it.statusOf(it.tasks.first()) })
        model.toggle("a")
        model.toggle("a")
        model.toggle("a")
        gate.complete(Unit)
        assertEquals(listOf(TaskUpdate(TaskStatus.Completed), TaskUpdate(TaskStatus.Todo)), tasks.updates)
        assertEquals(
            TaskStatus.Todo,
            model.list
                ?.tasks
                ?.first()
                ?.status,
        )
        assertTrue(model.list?.pending?.isEmpty() == true)
    }

    @Test
    fun completingARepeatingTaskReloadsToShowTheNextOne() {
        val tasks = FakeTaskRepository(listOf(task("a", recurrence = weekly)), today)
        model(tasks).toggle("a")
        assertEquals(2, tasks.lists.size)
        val oneOff = FakeTaskRepository(listOf(task("b")), today)
        model(oneOff).toggle("b")
        assertEquals(1, oneOff.lists.size)
    }

    @Test
    fun anotherScreensChangeRefreshesOnAppear() {
        val tasks = FakeTaskRepository(listOf(task("a")), today)
        val model = model(tasks)
        model.appear()
        assertEquals(1, tasks.lists.size)
        tasks.replace(task("a", status = TaskStatus.Completed))
        changes.changed()
        model.appear()
        assertEquals(2, tasks.lists.size)
        assertEquals(
            TaskStatus.Completed,
            model.list
                ?.tasks
                ?.first()
                ?.status,
        )
    }
}

class TaskEditorViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val due = LocalDate.parse("2026-11-24")

    @Test
    fun aNewTaskIsCreatedAndSaysSavedOnlyAfterTheServerAnswers() {
        val tasks = FakeTaskRepository()
        val model = TaskEditorViewModel(tasks)
        model.start("r1", null, "Asia/Kolkata", due)
        model.edit { it.copy(title = " Call the bank ", dueDate = due, repeat = RepeatDraft(RepeatDraft.Preset.Weekly)) }
        val gate = CompletableDeferred<Unit>()
        tasks.holdNext(gate)
        model.save()
        assertEquals(TaskEditorUiState.Status.Saving, model.uiState.value?.status)
        gate.complete(Unit)
        val saved = model.uiState.value?.status as TaskEditorUiState.Status.Saved
        assertEquals("Call the bank", saved.task.title)
        val call = tasks.calls.single() as FakeTaskRepository.Call.Save
        assertNull(call.id)
        assertEquals(listOf(2), (call.task.recurrence as FieldChange.Set).value.weekdays)
    }

    @Test
    fun pastedTextIsCutAndMinutesTakeDigitsOnly() {
        val model = TaskEditorViewModel(FakeTaskRepository())
        model.start("r1", null, "UTC", null)
        model.edit { it.copy(title = "a".repeat(200), notes = "b".repeat(6000), estimate = "4 5 min") }
        val form = checkNotNull(model.uiState.value).form
        assertEquals(TaskForm.TITLE_LIMIT, form.title.length)
        assertEquals(TaskForm.NOTES_LIMIT, form.notes.length)
        assertEquals("45", form.estimate)
    }

    @Test
    fun theServersFieldErrorsLandOnTheirFieldsAndEditingClearsThem() {
        val tasks = FakeTaskRepository()
        tasks.failNext(
            AppError.Validation(
                ServerMessage("Check the task details and try again."),
                mapOf("estimatedDurationMinutes" to listOf("Too big")),
            ),
        )
        val model = TaskEditorViewModel(tasks)
        model.start("r1", null, "UTC", null)
        model.edit { it.copy(title = "Call the bank") }
        model.save()
        assertEquals(
            "Too big",
            model.uiState.value
                ?.serverErrors
                ?.get(TaskForm.Field.Estimate),
        )
        assertNull(model.uiState.value?.failure)
        model.edit { it.copy(estimate = "30") }
        assertNull(
            model.uiState.value
                ?.serverErrors
                ?.get(TaskForm.Field.Estimate),
        )
    }

    @Test
    fun problemsShowOnlyAfterSaveIsTriedAndNothingIsSent() {
        val tasks = FakeTaskRepository()
        val model = TaskEditorViewModel(tasks)
        model.start("r1", null, "UTC", null)
        assertNull(model.uiState.value?.problem(TaskForm.Field.Title))
        model.save()
        assertEquals(TaskForm.Problem.TitleMissing, model.uiState.value?.problem(TaskForm.Field.Title))
        assertTrue(tasks.calls.isEmpty())
    }

    @Test
    fun startingAgainForTheSameRequestKeepsWhatWasTyped() {
        val model = TaskEditorViewModel(FakeTaskRepository())
        model.start("r1", null, "UTC", null)
        model.edit { it.copy(title = "Half typed") }
        model.start("r1", null, "UTC", null)
        assertEquals(
            "Half typed",
            model.uiState.value
                ?.form
                ?.title,
        )
        assertTrue(model.uiState.value?.hasChanges == true)
    }
}

class TaskDetailViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val weekly = TaskRecurrence(RecurrenceFrequency.Weekly, 1, listOf(2), null, null, true, "Every Tue")

    @Test
    fun aTaskDeletedElsewhereShowsNotFound() {
        assertEquals(TaskDetailUiState.NotFound, TaskDetailViewModel("a", FakeTaskRepository(), TaskChanges()).uiState.value)
    }

    @Test
    fun theStatusMovesAndComesBackWhenRefused() {
        val tasks = FakeTaskRepository(listOf(task("a")))
        val model = TaskDetailViewModel("a", tasks, TaskChanges())
        model.setStatus(TaskStatus.InProgress)
        assertEquals(TaskStatus.InProgress, model.detail?.task?.status)
        tasks.failNext(AppError.Offline)
        model.setStatus(TaskStatus.Completed)
        assertEquals(TaskStatus.InProgress, model.detail?.status)
        assertEquals(TaskDetail.Action.Status, model.detail?.problem?.action)
    }

    @Test
    fun skippingMovesARepeatingTaskAndAOneOffCannotBeSkipped() {
        val tasks = FakeTaskRepository(listOf(task("a", due = "2026-11-24", recurrence = weekly), task("b")))
        val changes = TaskChanges()
        val model = TaskDetailViewModel("a", tasks, changes)
        model.skip()
        assertEquals(LocalDate.parse("2026-12-01"), model.detail?.task?.dueDate)
        assertEquals(1, changes.version.value)
        val oneOff = TaskDetailViewModel("b", tasks, changes)
        oneOff.skip()
        assertTrue(tasks.calls.none { it == FakeTaskRepository.Call.Skip("b") })
    }

    @Test
    fun deletingEndsTheScreenAndAFailureKeepsIt() {
        val tasks = FakeTaskRepository(listOf(task("a")))
        val model = TaskDetailViewModel("a", tasks, TaskChanges())
        tasks.failNext(AppError.Offline)
        model.delete()
        assertEquals(TaskDetail.Action.Delete, model.detail?.problem?.action)
        model.delete()
        assertEquals(TaskDetailUiState.Deleted, model.uiState.value)
        assertTrue(tasks.tasks.isEmpty())
    }
}
