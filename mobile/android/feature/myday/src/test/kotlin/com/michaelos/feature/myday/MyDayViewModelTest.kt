package com.michaelos.feature.myday

import androidx.lifecycle.SavedStateHandle
import com.michaelos.core.model.AppError
import com.michaelos.core.model.HabitCheckIn
import com.michaelos.core.model.MyDay
import com.michaelos.core.model.ServerMessage
import com.michaelos.core.model.TaskStatus
import com.michaelos.core.model.TaskUpdate
import com.michaelos.core.testing.FakeHabitRepository
import com.michaelos.core.testing.FakeMyDayRepository
import com.michaelos.core.testing.FakeTaskRepository
import com.michaelos.core.testing.MainDispatcherRule
import com.michaelos.core.testing.MyDayExamples
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

class MyDayViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private class MutableClock(
        var now: Instant,
    ) : Clock() {
        override fun getZone(): ZoneId = ZoneOffset.UTC

        override fun withZone(zone: ZoneId?): Clock = this

        override fun instant(): Instant = now
    }

    private val example = MyDayExamples.day()
    private val clock = MutableClock(Instant.parse("2026-11-17T15:00:00Z"))
    private val days = FakeMyDayRepository(example)
    private val tasks = FakeTaskRepository(example.tasks!!.dailyTasks.map { it.task })
    private val habits = FakeHabitRepository()

    private fun model(requestedDate: LocalDate? = null) =
        MyDayViewModel(days, tasks, habits, clock, SavedStateHandle(mapOf("myDay.requestedDate" to requestedDate?.toString())))

    private val MyDayViewModel.state get() = uiState.value

    private val MyDayViewModel.day: MyDayContent
        get() =
            when (val state = state) {
                is MyDayUiState.Content -> state.day
                is MyDayUiState.Empty -> state.day
                else -> error("Expected a day, got $state")
            }

    private fun MyDayViewModel.task(id: String) = day.tasks.first { it.id == id }

    private val MyDayViewModel.habit get() = day.habits.first()

    /** What the server returns once a write has been saved. */
    private fun serverSaves(change: (MyDay) -> MyDay) {
        days.day = change(days.day)
    }

    private fun MyDay.withDailyStatus(
        index: Int,
        status: TaskStatus?,
    ): MyDay {
        val section = tasks!!
        val daily = section.dailyTasks.toMutableList()
        daily[index] = daily[index].copy(statusAtSelectedDate = status)
        return copy(tasks = section.copy(dailyTasks = daily))
    }

    private fun MyDay.withHabitDone(
        done: Boolean,
        checkIns: List<HabitCheckIn>? = null,
    ): MyDay {
        val section = habits!!
        return copy(
            habits = section.copy(habits = section.habits.map { it.copy(completedToday = done, checkIns = checkIns ?: it.checkIns) }),
        )
    }

    @Test
    fun firstLoadShowsTheServersToday() {
        val model = model()
        assertEquals(listOf<LocalDate?>(null), days.requests)
        assertTrue(model.state is MyDayUiState.Content)
        assertTrue(model.day.isToday)
        assertEquals(listOf(TaskStatus.Todo, TaskStatus.Todo, TaskStatus.InProgress), model.day.tasks.map { it.status })
        assertTrue(model.day.tasks.all { it.canToggle })
        assertEquals(listOf(true), model.day.habits.map { it.isDone })
    }

    @Test
    fun nothingForTheDayIsOneEmptyState() {
        days.day =
            example.copy(tasks = example.tasks!!.copy(dailyTasks = emptyList()), habits = example.habits!!.copy(habits = emptyList()))
        val state = model().state
        assertTrue("Expected empty, got $state", state is MyDayUiState.Empty)
        assertEquals("Sam", (state as MyDayUiState.Empty).day.myDay.greetingName)
    }

    @Test
    fun aSectionThatFailedIsNotEmpty() {
        days.day = example.copy(tasks = null, habits = example.habits!!.copy(habits = emptyList()))
        val model = model()
        assertTrue(model.state is MyDayUiState.Content)
        assertTrue(model.day.tasks.isEmpty())
    }

    @Test
    fun failureWithNothingShownCanBeRetried() {
        days.failNext(AppError.Offline)
        val model = model()
        assertEquals(MyDayUiState.Failed(AppError.Offline), model.state)
        model.load()
        assertTrue(model.state is MyDayUiState.Content)
    }

    @Test
    fun refreshKeepsTheDayOnScreenAndSaysWhyItFailed() {
        val model = model()
        val gate = CompletableDeferred<Unit>()
        days.holdNext(gate)
        model.refresh()
        assertTrue(model.day.isRefreshing)
        assertEquals(3, model.day.tasks.size)
        days.failNext(AppError.Timeout)
        gate.complete(Unit)
        assertFalse(model.day.isRefreshing)
        assertEquals(AppError.Timeout, model.day.refreshProblem)
        assertEquals(3, model.day.tasks.size)

        model.refresh()
        assertNull(model.day.refreshProblem)
    }

    @Test
    fun returningAfterAMinuteRefreshesAndSoonerDoesNot() {
        val model = model()
        clock.now = clock.now.plusSeconds(59)
        model.appear()
        assertEquals(1, days.requests.size)
        clock.now = clock.now.plusSeconds(2)
        model.appear()
        assertEquals(2, days.requests.size)
    }

    @Test
    fun midnightMovesTodayToTheNewDay() {
        val model = model()
        val tomorrow = LocalDate.parse("2026-11-18")
        days.day = example.copy(today = tomorrow, selectedDate = tomorrow)
        clock.now = clock.now.plusSeconds(3_600)
        model.appear()
        assertEquals(listOf<LocalDate?>(null, null), days.requests)
        assertEquals(tomorrow, model.day.myDay.selectedDate)
        assertTrue(model.day.isToday)
    }

    @Test
    fun steppingAsksForThatDateAndBackToTodayFollowsTheServer() {
        val model = model()
        val yesterday = LocalDate.parse("2026-11-16")
        days.day = example.copy(selectedDate = yesterday)
        model.step(-1)
        assertEquals(yesterday, model.requestedDate)
        assertEquals(yesterday, days.requests.last())
        model.step(1)
        assertNull(model.requestedDate)
        assertNull(days.requests.last())

        days.day = example.copy(selectedDate = yesterday)
        model.step(-1)
        model.showToday()
        assertNull(model.requestedDate)
    }

    @Test
    fun theRequestedDateSurvivesTheProcess() {
        val yesterday = LocalDate.parse("2026-11-16")
        model(requestedDate = yesterday)
        assertEquals(listOf<LocalDate?>(yesterday), days.requests)
    }

    @Test
    fun aPastDateShowsThatDaysStatusesAndCannotBeChanged() {
        val past = LocalDate.parse("2026-11-16")
        days.day =
            example
                .copy(selectedDate = past)
                .withDailyStatus(0, null)
                .withDailyStatus(1, TaskStatus.Completed)
                .withHabitDone(true, listOf(HabitCheckIn("old", past, Instant.EPOCH)))
        val model = model(requestedDate = past)
        assertTrue(model.day.isReadOnly)
        assertEquals(listOf(null, TaskStatus.Completed, TaskStatus.InProgress), model.day.tasks.map { it.status })
        assertTrue(model.day.tasks.none { it.canToggle })
        assertEquals(listOf(true), model.day.habits.map { it.isDone })
        assertTrue(model.day.habits.none { it.canToggle })

        model.toggleTask(DENTIST)
        model.toggleHabit(WALK)
        assertTrue(tasks.updates.isEmpty())
        assertTrue(habits.calls.isEmpty())
    }

    @Test
    fun todayListsOverdueTasksFirst() {
        val section = example.tasks!!
        days.day =
            example.copy(
                tasks = section.copy(sections = section.sections.copy(overdue = section.sections.backlog.filter { it.task.id == DENTIST })),
            )
        val model = model()
        assertEquals(
            DENTIST,
            model.day.tasks
                .first()
                .id,
        )
        assertEquals(3, model.day.tasks.size)
    }

    @Test
    fun aCompletedOverdueTaskKeepsItsPlace() {
        val section = example.tasks!!
        val pastDue = section.dailyTasks[1].task.copy(dueDate = LocalDate.parse("2026-11-15"))
        val daily = section.dailyTasks.toMutableList()
        daily[1] = daily[1].copy(task = pastDue)
        days.day = example.copy(tasks = section.copy(dailyTasks = daily))
        val model = model()
        assertEquals(
            pastDue.id,
            model.day.tasks
                .first()
                .id,
        )
        assertTrue(
            model.day.tasks
                .first()
                .isOverdue,
        )
    }

    @Test
    fun completingATaskShowsAtOnceThenTakesTheServersAnswer() {
        val model = model()
        val gate = CompletableDeferred<Unit>()
        tasks.holdNext(gate)
        model.toggleTask(DENTIST)
        assertTrue(model.task(DENTIST).isSaving)
        assertTrue(model.task(DENTIST).isDone)
        assertFalse(model.task(DENTIST).canToggle)

        model.toggleTask(DENTIST)
        serverSaves { it.withDailyStatus(0, TaskStatus.Completed) }
        gate.complete(Unit)
        assertEquals(listOf(TaskUpdate(TaskStatus.Completed)), tasks.updates)
        val done = model.task(DENTIST)
        assertTrue(done.isDone)
        assertFalse(done.isSaving)
        assertNull(done.rollback)
        assertEquals("a write refreshes the day's counts in place", 2, days.requests.size)
    }

    @Test
    fun aRefusedTaskChangeRollsBackAndSaysWhy() {
        val model = model()
        val refusal = AppError.NotFound(ServerMessage("Task not found."))
        tasks.failNext(refusal)
        model.toggleTask(DENTIST)
        val rolledBack = model.task(DENTIST)
        assertEquals(TaskStatus.Todo, rolledBack.status)
        assertFalse(rolledBack.isSaving)
        assertEquals(MyDayRollback(MyDayRollback.Action.Complete, refusal), rolledBack.rollback)
        assertEquals(1, days.requests.size)

        serverSaves { it.withDailyStatus(0, TaskStatus.Completed) }
        model.toggleTask(DENTIST)
        assertNull(model.task(DENTIST).rollback)
        assertTrue(model.task(DENTIST).isDone)
    }

    @Test
    fun aCompletedTaskReopens() {
        days.day = example.withDailyStatus(0, TaskStatus.Completed)
        model().toggleTask(DENTIST)
        assertEquals(listOf(TaskUpdate(TaskStatus.Todo)), tasks.updates)
    }

    @Test
    fun undoingACheckInShowsAtOnceThenSticks() {
        val model = model()
        val gate = CompletableDeferred<Unit>()
        habits.holdNext(gate)
        model.toggleHabit(WALK)
        assertTrue(model.habit.isSaving)
        assertFalse(model.habit.isDone)
        serverSaves { it.withHabitDone(false) }
        gate.complete(Unit)
        assertEquals(listOf<FakeHabitRepository.Call>(FakeHabitRepository.Call.Undo(WALK, "cmwktkhwj000b40v389b6vire")), habits.calls)
        assertFalse(model.habit.isDone)
        assertFalse(model.habit.isSaving)
    }

    @Test
    fun checkingInSendsTheServersToday() {
        days.day = example.withHabitDone(false, emptyList())
        val model = model()
        serverSaves { it.withHabitDone(true) }
        model.toggleHabit(WALK)
        assertEquals(listOf<FakeHabitRepository.Call>(FakeHabitRepository.Call.CheckIn(WALK, LocalDate.parse("2026-11-17"))), habits.calls)
        assertTrue(model.habit.isDone)
    }

    @Test
    fun aRefusedCheckInRollsBackAndSaysWhy() {
        days.day = example.withHabitDone(false, emptyList())
        val model = model()
        val refusal = AppError.Validation(ServerMessage("This habit isn't scheduled for that local date."), emptyMap())
        habits.failNext(refusal)
        model.toggleHabit(WALK)
        assertFalse(model.habit.isDone)
        assertEquals(MyDayRollback(MyDayRollback.Action.CheckIn, refusal), model.habit.rollback)

        val archived = AppError.Conflict(ServerMessage("Reactivate this habit before checking it in."))
        habits.failNext(archived)
        model.toggleHabit(WALK)
        assertEquals(archived, model.habit.rollback?.error)
    }

    @Test
    fun undoingACheckInAlreadyUndoneElsewhereAgreesWithTheServer() {
        val model = model()
        habits.failNext(AppError.NotFound(ServerMessage("Check-in not found.")))
        serverSaves { it.withHabitDone(false) }
        model.toggleHabit(WALK)
        assertFalse(model.habit.isDone)
        assertNull(model.habit.rollback)
    }

    @Test
    fun aWriteThatFinishesAfterTheDayChangedLeavesTheNewDayAlone() {
        val model = model()
        val gate = CompletableDeferred<Unit>()
        tasks.holdNext(gate)
        model.toggleTask(DENTIST)
        val dayGate = CompletableDeferred<Unit>()
        days.holdNext(dayGate)
        model.step(-1)
        gate.complete(Unit)
        assertEquals(MyDayUiState.Loading, model.state)
    }

    private companion object {
        const val DENTIST = "cmwktkg3p000440v3mwsa92bo"
        const val WALK = "cmwktkgu1000940v3jdfg8155"
    }
}
