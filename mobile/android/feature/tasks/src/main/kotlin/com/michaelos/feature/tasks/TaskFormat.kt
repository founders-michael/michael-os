package com.michaelos.feature.tasks

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import com.michaelos.core.model.AppError
import com.michaelos.core.model.RecurrenceFrequency
import com.michaelos.core.model.RecurrenceRule
import com.michaelos.core.model.Task
import com.michaelos.core.model.TaskPriority
import com.michaelos.core.model.TaskStatus
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.time.format.TextStyle
import java.util.Locale

/**
 * Server dates are calendar dates in the profile's zone, and the reminder instant is shown on that zone's clock, so the
 * device's own time zone never moves what the screen says.
 */
internal object TaskFormat {
    fun shortDate(
        date: LocalDate,
        locale: Locale,
    ): String = date.format(DateTimeFormatter.ofPattern("EEE d MMM", locale))

    fun longDate(date: LocalDate): String = date.format(DateTimeFormatter.ofLocalizedDate(FormatStyle.FULL))

    fun isOverdue(
        task: Task,
        today: LocalDate?,
    ): Boolean = task.status != TaskStatus.Completed && today != null && task.dueDate?.isBefore(today) == true
}

@Composable
internal fun dueText(
    task: Task,
    today: LocalDate?,
): String {
    val locale = LocalConfiguration.current.locales[0]
    val due = task.dueDate ?: return stringResource(R.string.tasks_due_none)
    val date = TaskFormat.shortDate(due, locale)
    return when {
        TaskFormat.isOverdue(task, today) -> stringResource(R.string.tasks_due_overdue, date)
        due == today -> stringResource(R.string.tasks_due_today)
        else -> stringResource(R.string.tasks_due_on, date)
    }
}

@Composable
internal fun priorityText(priority: TaskPriority): String =
    stringResource(
        when (priority) {
            TaskPriority.High -> R.string.tasks_priority_high
            TaskPriority.Medium, TaskPriority.Unknown -> R.string.tasks_priority_medium
            TaskPriority.Low -> R.string.tasks_priority_low
        },
    )

@Composable
internal fun statusText(status: TaskStatus): String =
    stringResource(
        when (status) {
            TaskStatus.Todo, TaskStatus.Unknown -> R.string.tasks_status_todo
            TaskStatus.InProgress -> R.string.tasks_status_in_progress
            TaskStatus.Completed -> R.string.tasks_status_completed
        },
    )

@Composable
internal fun minutesText(minutes: Int): String = pluralStringResource(R.plurals.tasks_minutes, minutes, minutes)

/** "Remind 08:30 · 27 Nov" on the profile's clock. */
@Composable
internal fun reminderText(
    instant: Instant,
    zone: ZoneId,
): String {
    val locale = LocalConfiguration.current.locales[0]
    val clock = instant.atZone(zone)
    val time = clock.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale))
    val day = clock.format(DateTimeFormatter.ofPattern("d MMM", locale))
    return stringResource(R.string.tasks_reminder, time, day)
}

@Composable
internal fun weekdayName(day: Int): String = DayOfWeek.of(day).getDisplayName(TextStyle.SHORT, LocalConfiguration.current.locales[0])

/** The editor's preview of a repeat, worded on the device. Rows show the server's own `label`. */
@Composable
internal fun repeatSummary(rule: RecurrenceRule): String {
    val locale = LocalConfiguration.current.locales[0]
    val base =
        when (rule.frequency) {
            RecurrenceFrequency.Daily, RecurrenceFrequency.Unknown -> {
                pluralStringResource(R.plurals.tasks_repeat_summary_daily, rule.interval, rule.interval)
            }

            RecurrenceFrequency.Weekly -> {
                val days =
                    if (rule.weekdays == WORKDAYS) {
                        stringResource(R.string.tasks_repeat_weekdays_only)
                    } else {
                        rule.weekdays.joinToString(", ") { DayOfWeek.of(it).getDisplayName(TextStyle.SHORT, locale) }
                    }
                if (rule.interval == 1) {
                    stringResource(R.string.tasks_repeat_summary_weekly, days)
                } else {
                    pluralStringResource(R.plurals.tasks_repeat_summary_weeks, rule.interval, rule.interval, days)
                }
            }

            RecurrenceFrequency.Monthly -> {
                val day = rule.monthDay ?: 1
                if (rule.interval == 1) {
                    stringResource(R.string.tasks_repeat_summary_monthly, day)
                } else {
                    pluralStringResource(R.plurals.tasks_repeat_summary_months, rule.interval, rule.interval, day)
                }
            }
        }
    val ends = rule.endsOn ?: return base
    return stringResource(R.string.tasks_repeat_summary_until, base, TaskFormat.shortDate(ends, locale))
}

private val WORKDAYS = (DayOfWeek.MONDAY.value..DayOfWeek.FRIDAY.value).toList()

/** Shown in place of the list when nothing could be loaded. */
@Composable
internal fun AppError.loadMessage(): String =
    when (this) {
        AppError.Offline -> stringResource(R.string.tasks_error_offline)
        AppError.Timeout -> stringResource(R.string.tasks_error_timeout)
        AppError.Decoding -> stringResource(R.string.tasks_error_generic)
        is AppError.Forbidden -> server.text
        is AppError.NotFound -> server.text
        is AppError.Conflict -> server.text
        is AppError.Server -> server.text
        is AppError.Validation -> server.text
        is AppError.Unauthorized -> server.text
        is AppError.RateLimited -> server.text
    } ?: stringResource(R.string.tasks_error_generic)

/** The server's reason for refusing a change, when it gave one. */
internal val AppError.refusal: String?
    get() =
        when (this) {
            is AppError.Forbidden -> server.text
            is AppError.NotFound -> server.text
            is AppError.Conflict -> server.text
            is AppError.Validation -> server.text
            else -> null
        }

@Composable
internal fun rollbackText(rollback: TaskRollback): String {
    val fallback = stringResource(if (rollback.completing) R.string.tasks_rollback_complete else R.string.tasks_rollback_reopen)
    val reason = rollback.error.refusal ?: return fallback
    return stringResource(R.string.tasks_rollback_reason, fallback, reason)
}

@Composable
internal fun problemText(problem: TaskForm.Problem): String =
    stringResource(
        when (problem) {
            TaskForm.Problem.TitleMissing -> R.string.tasks_editor_problem_title
            TaskForm.Problem.MinutesOutOfRange -> R.string.tasks_editor_problem_minutes
            TaskForm.Problem.RepeatNeedsDueDate -> R.string.tasks_editor_problem_repeat_due_date
            TaskForm.Problem.RepeatNeedsWeekday -> R.string.tasks_editor_problem_repeat_weekday
            TaskForm.Problem.EndsBeforeDueDate -> R.string.tasks_editor_problem_repeat_ends
            TaskForm.Problem.ReminderHalfSet -> R.string.tasks_editor_problem_reminder
        },
    )
