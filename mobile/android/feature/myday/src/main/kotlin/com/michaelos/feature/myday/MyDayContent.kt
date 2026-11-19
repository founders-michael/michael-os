package com.michaelos.feature.myday

import com.michaelos.core.model.AppError
import com.michaelos.core.model.Habit
import com.michaelos.core.model.HabitCheckIn
import com.michaelos.core.model.HabitStatus
import com.michaelos.core.model.MyDay
import com.michaelos.core.model.SectionTask
import com.michaelos.core.model.Task
import com.michaelos.core.model.TaskSections
import com.michaelos.core.model.TaskStatus
import com.michaelos.core.model.TimelineItem
import java.time.Instant

/**
 * A loaded day as the screen shows it: the server's answer, plus the writes still in flight and the ones the
 * server refused. Rows are derived, never stored.
 */
data class MyDayContent(
    val myDay: MyDay,
    val loadedAt: Instant,
    val isRefreshing: Boolean = false,
    /** A refresh failed while this data stayed on screen. */
    val refreshProblem: AppError? = null,
    /** Keyed by task or habit ID. */
    val rollbacks: Map<String, MyDayRollback> = emptyMap(),
    internal val pendingTasks: Map<String, TaskStatus> = emptyMap(),
    internal val pendingHabits: Map<String, Boolean> = emptyMap(),
) {
    val isToday: Boolean get() = myDay.selectedDate == myDay.today

    /** Writes are only for today. Another date shows what was true on it. */
    val isReadOnly: Boolean get() = !isToday

    /**
     * Today also lists overdue tasks, which need a decision even though nothing happened to them today. Tasks due
     * before today come first, by due date alone, so completing one does not move its row.
     */
    val tasks: List<MyDayTaskRow>
        get() {
            val section = myDay.tasks ?: return emptyList()
            val seen = mutableSetOf<String>()
            val rows = mutableListOf<MyDayTaskRow>()
            if (isToday) {
                section.sections.overdue
                    .filter { seen.add(it.task.id) }
                    .forEach { rows += taskRow(it.task, it.task.status) }
            }
            section.dailyTasks.filter { seen.add(it.task.id) }.forEach { entry ->
                rows += taskRow(entry.task, entry.statusAtSelectedDate ?: entry.task.status.takeIf { isToday })
            }
            val (pastDue, rest) = rows.partition { row -> row.task.dueDate?.isBefore(myDay.today) == true }
            return pastDue + rest
        }

    val habits: List<MyDayHabitRow>
        get() {
            val section = myDay.habits ?: return emptyList()
            return section.habits.map { habit ->
                val pending = pendingHabits[habit.id]
                val done =
                    if (isToday) {
                        pending ?: habit.completedToday
                    } else {
                        habit.checkIns.any { it.localDate == myDay.selectedDate }
                    }
                MyDayHabitRow(
                    habit = habit,
                    isDone = done,
                    isSaving = pending != null,
                    canToggle = isToday && pending == null && habit.status == HabitStatus.Active,
                    rollback = rollbacks[habit.id],
                )
            }
        }

    internal val isEmpty: Boolean
        get() {
            val timeline = myDay.timeline ?: return false
            if (myDay.tasks == null || myDay.habits == null) return false
            return tasks.isEmpty() && habits.isEmpty() && timeline.isEmpty()
        }

    /** The first timeline item that has not ended yet, on today only. */
    fun nextItem(now: Instant): TimelineItem? = if (isToday) myDay.timeline?.firstOrNull { it.endAt.isAfter(now) } else null

    /** The status on the selected date of the task a timeline item belongs to. */
    fun taskStatus(item: TimelineItem): TaskStatus? {
        val taskId = item.taskId ?: return null
        return myDay.tasks
            ?.dailyTasks
            ?.firstOrNull { it.task.id == taskId }
            ?.statusAtSelectedDate
    }

    private fun taskRow(
        task: Task,
        status: TaskStatus?,
    ): MyDayTaskRow {
        val pending = pendingTasks[task.id]
        val shown = pending ?: status
        val overdue = task.dueDate?.isBefore(myDay.today) == true
        return MyDayTaskRow(
            task = task,
            status = shown,
            isOverdue = overdue && shown != TaskStatus.Completed,
            isSaving = pending != null,
            canToggle = isToday && pending == null && shown != null && shown != TaskStatus.Unknown,
            rollback = rollbacks[task.id],
        )
    }

    internal fun replacedWith(
        fresh: MyDay,
        time: Instant,
    ): MyDayContent =
        copy(
            myDay = fresh,
            loadedAt = time,
            isRefreshing = false,
            refreshProblem = null,
            rollbacks = if (fresh.selectedDate == myDay.selectedDate) rollbacks else emptyMap(),
        )

    /** The task as the server saved it. Its status today is its current status. */
    internal fun applying(saved: Task): MyDayContent {
        val section = myDay.tasks ?: return copy(pendingTasks = pendingTasks - saved.id)
        val daily =
            section.dailyTasks.map { entry ->
                if (entry.task.id != saved.id) {
                    entry
                } else {
                    entry.copy(task = saved, statusAtSelectedDate = if (isToday) saved.status else entry.statusAtSelectedDate)
                }
            }
        return copy(
            myDay = myDay.copy(tasks = section.copy(dailyTasks = daily, sections = section.sections.replacing(saved))),
            pendingTasks = pendingTasks - saved.id,
        )
    }

    internal fun applyingCheckIn(
        checkIn: HabitCheckIn,
        habitId: String,
    ): MyDayContent =
        updatingHabit(habitId) { habit ->
            val checkIns = if (habit.checkIns.any { it.id == checkIn.id }) habit.checkIns else listOf(checkIn) + habit.checkIns
            habit.copy(completedToday = true, checkIns = checkIns)
        }.copy(pendingHabits = pendingHabits - habitId)

    internal fun removingCheckIn(
        checkInId: String,
        habitId: String,
    ): MyDayContent =
        updatingHabit(habitId) { habit ->
            habit.copy(completedToday = false, checkIns = habit.checkIns.filterNot { it.id == checkInId })
        }.copy(pendingHabits = pendingHabits - habitId)

    private fun updatingHabit(
        habitId: String,
        change: (Habit) -> Habit,
    ): MyDayContent {
        val section = myDay.habits ?: return this
        return copy(myDay = myDay.copy(habits = section.copy(habits = section.habits.map { if (it.id == habitId) change(it) else it })))
    }
}

data class MyDayTaskRow(
    val task: Task,
    /** Null when the task's status on a past date cannot be reconstructed. */
    val status: TaskStatus?,
    val isOverdue: Boolean,
    /** A change the user made is waiting for the server. */
    val isSaving: Boolean,
    val canToggle: Boolean,
    val rollback: MyDayRollback?,
) {
    val id: String get() = task.id
    val isDone: Boolean get() = status == TaskStatus.Completed
}

data class MyDayHabitRow(
    val habit: Habit,
    val isDone: Boolean,
    val isSaving: Boolean,
    val canToggle: Boolean,
    val rollback: MyDayRollback?,
) {
    val id: String get() = habit.id
}

/** A change shown on screen that the server refused, so the row went back to what it was. */
data class MyDayRollback(
    val action: Action,
    val error: AppError,
) {
    enum class Action { Complete, Reopen, CheckIn, UndoCheckIn }
}

private fun TaskSections.replacing(task: Task): TaskSections {
    fun List<SectionTask>.swap() = map { if (it.task.id == task.id) it.copy(task = task) else it }
    return copy(
        today = today.swap(),
        overdue = overdue.swap(),
        upcoming = upcoming.swap(),
        backlog = backlog.swap(),
        completed = completed.swap(),
    )
}
