package com.michaelos.feature.goals

import android.text.format.DateFormat
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Goal
import com.michaelos.core.model.GoalStatus
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/** Server dates are calendar dates in the profile's zone; they are formatted as they are, never through a zone. */
@Composable
internal fun dateText(date: LocalDate): String {
    val locale = LocalConfiguration.current.locales[0]
    return date.format(DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, "dMMMyyyy"), locale))
}

@Composable
internal fun statusText(status: GoalStatus): String =
    stringResource(
        when (status) {
            GoalStatus.Active, GoalStatus.Unknown -> R.string.goals_status_active
            GoalStatus.Completed -> R.string.goals_status_completed
            GoalStatus.Archived -> R.string.goals_status_archived
        },
    )

@Composable
internal fun milestonesText(goal: Goal): String =
    if (goal.milestoneCount == 0) {
        stringResource(R.string.goals_milestones_none_short)
    } else {
        pluralStringResource(R.plurals.goals_milestones_of, goal.milestoneCount, goal.completedMilestoneCount, goal.milestoneCount)
    }

@Composable
internal fun targetText(target: GoalTarget): String =
    when (target) {
        GoalTarget.None -> stringResource(R.string.goals_target_none)
        is GoalTarget.Passed -> stringResource(R.string.goals_target_passed, dateText(target.date))
        GoalTarget.Today -> stringResource(R.string.goals_target_today)
        is GoalTarget.InDays -> pluralStringResource(R.plurals.goals_target_in_days, target.days, target.days)
        is GoalTarget.OnDate -> stringResource(R.string.goals_target_on, dateText(target.date))
    }

/** The web's `goalCoachRead` sentences, in order. */
@Composable
internal fun readText(read: GoalRead): String {
    val sentences = mutableListOf<String>()
    sentences +=
        when (val standing = read.standing) {
            GoalRead.Standing.NoMilestones -> {
                stringResource(R.string.goals_read_none)
            }

            is GoalRead.Standing.Drift -> {
                val percent = read.milestonePercent ?: 0
                stringResource(if (standing.ahead) R.string.goals_read_ahead else R.string.goals_read_behind, read.progress, percent)
            }

            GoalRead.Standing.InStep -> {
                pluralStringResource(R.plurals.goals_read_in_step, read.total, read.done, read.total, read.progress)
            }
        }
    val next = read.nextMilestone
    if (next != null) {
        sentences += stringResource(R.string.goals_read_next, next)
    } else if (read.total > 0) {
        sentences += stringResource(R.string.goals_read_all_done)
    }
    if (read.targetPassed) sentences += stringResource(R.string.goals_read_passed)
    return sentences.joinToString(" ")
}

@Composable
internal fun AppError.loadMessage(): String =
    when (this) {
        AppError.Offline -> stringResource(R.string.goals_error_offline)
        AppError.Timeout -> stringResource(R.string.goals_error_timeout)
        AppError.Decoding -> null
        is AppError.Forbidden -> server.text
        is AppError.NotFound -> server.text
        is AppError.Conflict -> server.text
        is AppError.Server -> server.text
        is AppError.Validation -> server.text
        is AppError.Unauthorized -> server.text
        is AppError.RateLimited -> server.text
    } ?: stringResource(R.string.goals_error_generic)
