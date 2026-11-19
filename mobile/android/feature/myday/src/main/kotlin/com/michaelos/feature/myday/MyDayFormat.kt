package com.michaelos.feature.myday

import android.text.format.DateFormat
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import com.michaelos.core.model.AppError
import com.michaelos.core.model.TaskStatus
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Server dates are calendar dates in the profile's zone, and instants are shown on that zone's clock, so the device's
 * own time zone never moves what the screen says. Times follow the device's 12 or 24 hour setting.
 */
internal class MyDayFormat(
    locale: Locale,
    is24Hour: Boolean,
) {
    private val dateFormat = DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, "EEEEdMMMM"), locale)
    private val timeFormat = DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, if (is24Hour) "Hm" else "hm"), locale)

    fun date(date: LocalDate): String = dateFormat.format(date)

    fun time(
        instant: Instant,
        timeZone: String,
    ): String = timeFormat.withZone(zone(timeZone)).format(instant)

    fun timeRange(
        start: Instant,
        end: Instant,
        timeZone: String,
    ): String = "${time(start, timeZone)} – ${time(end, timeZone)}"

    private fun zone(id: String): ZoneId = runCatching { ZoneId.of(id) }.getOrDefault(ZoneId.systemDefault())
}

@Composable
internal fun rememberMyDayFormat(): MyDayFormat {
    val locale = LocalConfiguration.current.locales[0]
    val is24Hour = DateFormat.is24HourFormat(LocalContext.current)
    return remember(locale, is24Hour) { MyDayFormat(locale, is24Hour) }
}

/** Shown in place of the day when nothing could be loaded. */
@Composable
internal fun AppError.loadMessage(): String =
    when (this) {
        AppError.Offline -> stringResource(R.string.myday_error_offline)
        AppError.Timeout -> stringResource(R.string.myday_error_timeout)
        AppError.Decoding -> stringResource(R.string.myday_error_generic)
        is AppError.Forbidden -> server.text
        is AppError.NotFound -> server.text
        is AppError.Conflict -> server.text
        is AppError.Server -> server.text
        is AppError.Validation -> server.text
        is AppError.Unauthorized -> server.text
        is AppError.RateLimited -> server.text
    } ?: stringResource(R.string.myday_error_generic)

internal val AppError.isConnectionProblem: Boolean get() = this == AppError.Offline || this == AppError.Timeout

/** The server's reason for refusing a change, when it gave one. */
private val AppError.refusal: String?
    get() =
        when (this) {
            is AppError.Forbidden -> server.text
            is AppError.NotFound -> server.text
            is AppError.Conflict -> server.text
            is AppError.Validation -> server.text
            else -> null
        }

@Composable
internal fun MyDayRollback.message(): String {
    val fallback =
        stringResource(
            when (action) {
                MyDayRollback.Action.Complete -> R.string.myday_rollback_complete
                MyDayRollback.Action.Reopen -> R.string.myday_rollback_reopen
                MyDayRollback.Action.CheckIn -> R.string.myday_rollback_check_in
                MyDayRollback.Action.UndoCheckIn -> R.string.myday_rollback_undo_check_in
            },
        )
    val reason = error.refusal ?: return fallback
    return stringResource(R.string.myday_rollback_reason, fallback, reason)
}

@Composable
internal fun TaskStatus.label(): String? =
    when (this) {
        TaskStatus.Completed -> stringResource(R.string.myday_status_done)
        TaskStatus.InProgress -> stringResource(R.string.myday_status_in_progress)
        TaskStatus.Todo -> stringResource(R.string.myday_status_pending)
        TaskStatus.Unknown -> null
    }
