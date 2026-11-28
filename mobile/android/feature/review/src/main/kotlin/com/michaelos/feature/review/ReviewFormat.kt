package com.michaelos.feature.review

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import com.michaelos.core.model.AppError
import com.michaelos.core.model.TaskStatus

@Composable
internal fun statusText(status: TaskStatus?): String =
    stringResource(
        when (status) {
            TaskStatus.Todo -> R.string.review_status_todo
            TaskStatus.InProgress -> R.string.review_status_in_progress
            TaskStatus.Completed -> R.string.review_status_completed
            else -> R.string.review_status_unknown
        },
    )

@Composable
internal fun movedText(moved: Moved): String =
    when (moved) {
        is Moved.Date -> stringResource(R.string.review_moved, dayText(moved.date))
        Moved.Unscheduled -> stringResource(R.string.review_moved_unscheduled)
    }

@Composable
internal fun problemText(problem: CarryForwardForm.Problem): String =
    stringResource(
        when (problem) {
            CarryForwardForm.Problem.TooEarly -> R.string.review_move_problem_date
            CarryForwardForm.Problem.OneTime -> R.string.review_move_problem_times
            CarryForwardForm.Problem.EndNotAfterStart -> R.string.review_move_problem_order
        },
    )

/** The web's `reviewLine`. */
@Composable
internal fun lineText(line: ReviewLine): String =
    when (line) {
        ReviewLine.NothingPlanned -> {
            stringResource(R.string.review_line_nothing)
        }

        is ReviewLine.Completed -> {
            val first =
                if (line.planned == 1) {
                    pluralStringResource(R.plurals.review_line_done_one, line.percent, line.done, line.planned, line.percent)
                } else {
                    pluralStringResource(R.plurals.review_line_done_other, line.percent, line.done, line.planned, line.percent)
                }
            val second =
                when (line.open) {
                    0 -> stringResource(R.string.review_line_none)
                    1 -> stringResource(R.string.review_line_open_one)
                    else -> pluralStringResource(R.plurals.review_line_open_other, line.open, line.open)
                }
            "$first $second"
        }
    }

@Composable
internal fun promptText(field: ReflectionDraft.Field): String =
    stringResource(
        when (field) {
            ReflectionDraft.Field.WentWell -> R.string.review_prompt_went_well
            ReflectionDraft.Field.Challenges -> R.string.review_prompt_challenges
            ReflectionDraft.Field.Blockers -> R.string.review_prompt_blockers
            ReflectionDraft.Field.LessonsLearned -> R.string.review_prompt_lessons
            ReflectionDraft.Field.Improvements -> R.string.review_prompt_improvements
        },
    )

@Composable
internal fun placeholderText(field: ReflectionDraft.Field): String =
    stringResource(
        when (field) {
            ReflectionDraft.Field.WentWell -> R.string.review_placeholder_went_well
            ReflectionDraft.Field.Challenges -> R.string.review_placeholder_challenges
            ReflectionDraft.Field.Blockers -> R.string.review_placeholder_blockers
            ReflectionDraft.Field.LessonsLearned -> R.string.review_placeholder_lessons
            ReflectionDraft.Field.Improvements -> R.string.review_placeholder_improvements
        },
    )

@Composable
internal fun AppError.message(): String =
    when (this) {
        AppError.Offline -> stringResource(R.string.review_error_offline)
        AppError.Timeout -> stringResource(R.string.review_error_timeout)
        AppError.Decoding -> null
        is AppError.Forbidden -> server.text
        is AppError.NotFound -> server.text
        is AppError.Conflict -> server.text
        is AppError.Server -> server.text
        is AppError.Validation -> server.text
        is AppError.Unauthorized -> server.text
        is AppError.RateLimited -> server.text
    } ?: stringResource(R.string.review_error_generic)
