package com.michaelos.feature.calendar

import android.text.format.DateFormat
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.michaelos.core.model.AppError
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/** Times are on the profile's clock; dates are calendar dates, never moved by a zone. */
internal object CalendarFormat {
    private val shortTime: DateTimeFormatter get() = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT)

    private fun pattern(skeleton: String): DateTimeFormatter =
        DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(Locale.getDefault(), skeleton))

    fun time(
        instant: Instant,
        clock: ZonedClock,
    ): String = shortTime.format(instant.atZone(clock.zoneId))

    fun time(time: LocalTime): String = shortTime.format(time)

    fun range(
        start: Instant,
        end: Instant,
        clock: ZonedClock,
    ): String = "${time(start, clock)} – ${time(end, clock)}"

    fun hour(hour: Int): String = time(LocalTime.of(hour, 0))

    fun month(date: LocalDate): String = pattern("MMMMyyyy").format(date)

    /** "Sunday 29", in the mock's order whatever the locale's date order. */
    fun dayTitle(date: LocalDate): String = DateTimeFormatter.ofPattern("EEEE d", Locale.getDefault()).format(date)

    fun weekdayShort(date: LocalDate): String = pattern("EEE").format(date)

    fun fullDate(date: LocalDate): String = pattern("EEEdMMMyyyy").format(date)

    fun shortDate(date: LocalDate): String = pattern("EEEdMMM").format(date)

    /** "Sun, 29 Nov · 9:00 AM – 10:30 AM" for a session that may fall on any day of the plan. */
    fun session(
        start: Instant,
        end: Instant,
        clock: ZonedClock,
    ): String = "${shortDate(clock.date(start))} · ${range(start, end, clock)}"
}

@Composable
internal fun EventKind.label(): String =
    stringResource(
        when (this) {
            EventKind.Commitment -> R.string.calendar_kind_commitment
            EventKind.Unavailable -> R.string.calendar_kind_unavailable
            EventKind.Session -> R.string.calendar_kind_session
        },
    )

@Composable
internal fun EventKind.help(): String =
    stringResource(
        when (this) {
            EventKind.Commitment -> R.string.calendar_kind_commitment_help
            EventKind.Unavailable -> R.string.calendar_kind_unavailable_help
            EventKind.Session -> R.string.calendar_kind_session_help
        },
    )

@Composable
internal fun AppError.message(): String =
    when (this) {
        AppError.Offline -> stringResource(R.string.calendar_error_offline)
        AppError.Timeout -> stringResource(R.string.calendar_error_timeout)
        else -> serverText() ?: stringResource(R.string.calendar_error_generic)
    }

private fun AppError.serverText(): String? =
    when (this) {
        is AppError.Unauthorized -> server.text
        is AppError.Forbidden -> server.text
        is AppError.NotFound -> server.text
        is AppError.Conflict -> server.text
        is AppError.Validation -> server.text
        is AppError.RateLimited -> server.text
        is AppError.Server -> server.text
        AppError.Offline, AppError.Timeout, AppError.Decoding -> null
    }

@Composable
internal fun PlanProblem.message(): String =
    when (this) {
        is PlanProblem.Stale -> {
            text ?: stringResource(R.string.calendar_plan_stale)
        }

        is PlanProblem.Refused -> {
            text ?: stringResource(R.string.calendar_plan_refused)
        }

        is PlanProblem.Unavailable -> {
            when (error) {
                AppError.Offline, AppError.Timeout -> error.message()
                else -> stringResource(R.string.calendar_plan_unavailable)
            }
        }
    }
