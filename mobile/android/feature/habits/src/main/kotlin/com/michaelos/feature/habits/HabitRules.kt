package com.michaelos.feature.habits

import com.michaelos.core.model.Habit
import com.michaelos.core.model.HabitFrequency
import com.michaelos.core.model.HabitSave
import com.michaelos.core.model.HabitStatus
import com.michaelos.core.model.Outcome
import java.time.LocalTime

/**
 * A habit's schedule as the editor holds it: daily or chosen weekdays, and an optional start and end time. Rules
 * mirror `habit-validation.ts`; the server checks them again.
 */
data class HabitSchedule(
    val frequency: HabitFrequency = HabitFrequency.Daily,
    val weekdays: Set<Int> = emptySet(),
    val startTime: LocalTime? = null,
    val endTime: LocalTime? = null,
) {
    enum class Problem { NoWeekday, EndWithoutStart, EndEqualsStart }

    val problem: Problem?
        get() =
            when {
                frequency == HabitFrequency.SelectedDays && weekdays.isEmpty() -> Problem.NoWeekday
                endTime != null && startTime == null -> Problem.EndWithoutStart
                endTime != null && endTime == startTime -> Problem.EndEqualsStart
                else -> null
            }

    /** An end earlier than the start runs past midnight, as in sleeping 23:00 to 07:00. */
    val runsPastMidnight: Boolean
        get() = startTime != null && endTime != null && endTime < startTime
}

/** The habit editor's fields. */
data class HabitForm(
    val title: String = "",
    val notes: String = "",
    val schedule: HabitSchedule = HabitSchedule(),
) {
    val titleMissing: Boolean get() = title.isBlank()

    /** The save, or null while the form cannot be saved. */
    val save: HabitSave?
        get() {
            if (titleMissing || schedule.problem != null) return null
            val daily = schedule.frequency == HabitFrequency.Daily
            return HabitSave(
                title = title.trim(),
                description = notes.trim().ifEmpty { null },
                frequency = schedule.frequency,
                weekdays = if (daily) emptyList() else schedule.weekdays.sorted(),
                startTime = schedule.startTime,
                endTime = schedule.endTime,
            )
        }

    companion object {
        const val TITLE_LIMIT = 160
        const val NOTES_LIMIT = 2000

        fun of(habit: Habit): HabitForm =
            HabitForm(
                title = habit.title,
                notes = habit.description.orEmpty(),
                schedule =
                    HabitSchedule(
                        frequency = if (habit.frequency == HabitFrequency.Unknown) HabitFrequency.Daily else habit.frequency,
                        weekdays = habit.weekdays.toSet(),
                        startTime = habit.startTime,
                        endTime = habit.endTime,
                    ),
            )
    }
}

/**
 * Michael's line on the Habits screen, mirrored from the web's `habitLine` (`habit-manager.tsx`): a rule over saved
 * data, never a model call.
 */
sealed interface HabitLine {
    /** The active habit due today with the longest streak, and what a check-in today would do. */
    data class Next(
        val habit: Habit,
    ) : HabitLine

    data object AllDone : HabitLine

    data object NothingToday : HabitLine

    enum class Record { Best, MatchesBest, None }

    companion object {
        /** Null when there is no active habit. */
        fun of(habits: List<Habit>): HabitLine? {
            val active = habits.filter { it.status == HabitStatus.Active }
            if (active.isEmpty()) return null
            val next = active.filter { it.todayScheduled && !it.completedToday }.maxByOrNull { it.currentStreak }
            return when {
                next != null -> Next(next)
                active.any { it.todayScheduled } -> AllDone
                else -> NothingToday
            }
        }

        /** Where a check-in today would put the streak against the best one. */
        fun record(habit: Habit): Record {
            val next = habit.currentStreak + 1
            return when {
                next > habit.bestStreak -> Record.Best
                next == habit.bestStreak -> Record.MatchesBest
                else -> Record.None
            }
        }
    }
}

/** Scheduled today first, then the rest, each by name. */
internal fun ordered(habits: List<Habit>): List<Habit> =
    habits.sortedWith(compareBy<Habit> { !it.todayScheduled }.thenBy(String.CASE_INSENSITIVE_ORDER) { it.title })

internal val Habit.dueToday: Boolean get() = status == HabitStatus.Active && todayScheduled

internal fun Outcome<*>.done(): Outcome<Unit> =
    when (this) {
        is Outcome.Success -> Outcome.Success(Unit)
        is Outcome.Failure -> this
    }
