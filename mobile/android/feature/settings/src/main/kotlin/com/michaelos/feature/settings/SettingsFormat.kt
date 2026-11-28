package com.michaelos.feature.settings

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.michaelos.core.data.Appearance
import com.michaelos.core.model.AppError
import com.michaelos.core.model.AvailabilityWindow
import com.michaelos.core.model.DayOfWeek
import com.michaelos.core.model.PlanningStyle

@Composable
internal fun appearanceText(appearance: Appearance): String =
    stringResource(
        when (appearance) {
            Appearance.System -> R.string.settings_appearance_system
            Appearance.Dark -> R.string.settings_appearance_dark
            Appearance.Light -> R.string.settings_appearance_light
        },
    )

@Composable
internal fun providerText(provider: String): String =
    when (provider) {
        "credential" -> stringResource(R.string.settings_provider_email)
        "google" -> stringResource(R.string.settings_provider_google)
        "apple" -> stringResource(R.string.settings_provider_apple)
        "github" -> stringResource(R.string.settings_provider_github)
        else -> provider
    }

@Composable
internal fun AppError.deleteMessage(): String =
    when {
        this is AppError.Conflict && server.code == "ORGANIZATION_MEMBERSHIP_BLOCKS_DELETION" -> {
            stringResource(R.string.settings_delete_organization)
        }

        this is AppError.Validation && server.code == "INVALID_PASSWORD" -> {
            stringResource(R.string.settings_delete_wrong_password)
        }

        else -> {
            message()
        }
    }

@Composable
internal fun AppError.message(): String =
    when (this) {
        AppError.Offline -> stringResource(R.string.settings_error_offline)
        AppError.Timeout -> stringResource(R.string.settings_error_timeout)
        AppError.Decoding -> null
        is AppError.Forbidden -> server.text
        is AppError.NotFound -> server.text
        is AppError.Conflict -> server.text
        is AppError.Server -> server.text
        is AppError.Validation -> server.text
        is AppError.Unauthorized -> server.text
        is AppError.RateLimited -> server.text
    } ?: stringResource(R.string.settings_error_generic)

@Composable
internal fun styleText(style: PlanningStyle): String =
    stringResource(
        when (style) {
            PlanningStyle.Structured -> R.string.settings_routine_style_structured
            PlanningStyle.Flexible -> R.string.settings_routine_style_flexible
            PlanningStyle.Balanced, PlanningStyle.Unknown -> R.string.settings_routine_style_balanced
        },
    )

@Composable
internal fun priorityProblemText(problem: RoutineForm.PriorityProblem): String =
    stringResource(
        when (problem) {
            RoutineForm.PriorityProblem.Empty -> R.string.settings_routine_priority_empty
            RoutineForm.PriorityProblem.TooLong -> R.string.settings_routine_priority_long
            RoutineForm.PriorityProblem.Duplicate -> R.string.settings_routine_priority_duplicate
            RoutineForm.PriorityProblem.Full -> R.string.settings_routine_priority_full
        },
    )

@Composable
internal fun weekdayText(day: DayOfWeek): String =
    stringResource(
        when (day) {
            DayOfWeek.Monday -> R.string.settings_day_monday
            DayOfWeek.Tuesday -> R.string.settings_day_tuesday
            DayOfWeek.Wednesday -> R.string.settings_day_wednesday
            DayOfWeek.Thursday -> R.string.settings_day_thursday
            DayOfWeek.Friday -> R.string.settings_day_friday
            DayOfWeek.Saturday -> R.string.settings_day_saturday
            DayOfWeek.Sunday, DayOfWeek.Unknown -> R.string.settings_day_sunday
        },
    )

@Composable
internal fun dayInitial(day: DayOfWeek): String =
    stringResource(
        when (day) {
            DayOfWeek.Monday -> R.string.settings_day_monday_initial
            DayOfWeek.Tuesday -> R.string.settings_day_tuesday_initial
            DayOfWeek.Wednesday -> R.string.settings_day_wednesday_initial
            DayOfWeek.Thursday -> R.string.settings_day_thursday_initial
            DayOfWeek.Friday -> R.string.settings_day_friday_initial
            DayOfWeek.Saturday -> R.string.settings_day_saturday_initial
            DayOfWeek.Sunday, DayOfWeek.Unknown -> R.string.settings_day_sunday_initial
        },
    )

internal fun windowRange(window: AvailabilityWindow): String = "${window.startTime} – ${window.endTime}"
