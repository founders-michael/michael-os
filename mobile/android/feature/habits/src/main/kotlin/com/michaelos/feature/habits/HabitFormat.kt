package com.michaelos.feature.habits

import android.text.format.DateFormat
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Habit
import com.michaelos.core.model.HabitFrequency
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.format.TextStyle

/** Server dates are calendar dates in the profile's zone; they are formatted as they are, never shifted. */
@Composable
internal fun dayText(date: LocalDate): String {
    val locale = LocalConfiguration.current.locales[0]
    return date.format(DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, "dMMM"), locale))
}

@Composable
internal fun timeText(time: LocalTime): String {
    val locale = LocalConfiguration.current.locales[0]
    return time.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale))
}

/** "Every day · 07:00" or "Mon, Wed, Fri · 23:00 – 07:00". */
@Composable
internal fun scheduleText(habit: Habit): String {
    val locale = LocalConfiguration.current.locales[0]
    val days =
        if (habit.frequency == HabitFrequency.Daily) {
            stringResource(R.string.habits_schedule_daily)
        } else {
            habit.weekdays.sorted().joinToString(", ") { DayOfWeek.of(it).getDisplayName(TextStyle.SHORT_STANDALONE, locale) }
        }
    val start = habit.startTime ?: return days
    val end = habit.endTime
    val clock = if (end == null) timeText(start) else stringResource(R.string.habits_schedule_range, timeText(start), timeText(end))
    return stringResource(R.string.habits_schedule_with_time, days, clock)
}

@Composable
internal fun lineText(line: HabitLine): String =
    when (line) {
        HabitLine.AllDone -> {
            stringResource(R.string.habits_line_all_done)
        }

        HabitLine.NothingToday -> {
            stringResource(R.string.habits_line_nothing)
        }

        is HabitLine.Next -> {
            val habit = line.habit
            val next = habit.currentStreak + 1
            val streak =
                when {
                    habit.currentStreak == 0 -> stringResource(R.string.habits_line_start)
                    HabitLine.record(habit) == HabitLine.Record.Best -> stringResource(R.string.habits_line_best, next)
                    HabitLine.record(habit) == HabitLine.Record.MatchesBest -> stringResource(R.string.habits_line_matches, next)
                    else -> stringResource(R.string.habits_line_streak, next)
                }
            if (habit.eligibleDays == 0) {
                streak
            } else {
                pluralStringResource(
                    R.plurals.habits_line_history,
                    habit.eligibleDays,
                    habit.title,
                    habit.completedDays,
                    habit.eligibleDays,
                    streak,
                )
            }
        }
    }

@Composable
internal fun AppError.loadMessage(): String =
    when (this) {
        AppError.Offline -> stringResource(R.string.habits_error_offline)
        AppError.Timeout -> stringResource(R.string.habits_error_timeout)
        AppError.Decoding -> null
        is AppError.Forbidden -> server.text
        is AppError.NotFound -> server.text
        is AppError.Conflict -> server.text
        is AppError.Server -> server.text
        is AppError.Validation -> server.text
        is AppError.Unauthorized -> server.text
        is AppError.RateLimited -> server.text
    } ?: stringResource(R.string.habits_error_generic)

/** A check-in that did not save, with the server's reason when it gave one. */
@Composable
internal fun AppError.rollbackMessage(): String {
    val reason =
        when (this) {
            is AppError.Forbidden -> server.text
            is AppError.NotFound -> server.text
            is AppError.Conflict -> server.text
            is AppError.Validation -> server.text
            else -> null
        }
    val fallback = stringResource(R.string.habits_rollback)
    return reason?.let { "$fallback $it" } ?: fallback
}
