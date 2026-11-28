package com.michaelos.feature.review

import android.text.format.DateFormat
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.pluralStringResource
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

/** Server dates are calendar dates in the profile's zone; they are formatted as they are, never through a zone. */
@Composable
internal fun dayText(date: LocalDate): String = date.format(pattern("EEEdMMM"))

@Composable
internal fun longDayText(date: LocalDate): String = date.format(pattern("EEEEdMMMM"))

@Composable
internal fun weekdayText(date: LocalDate): String = date.format(pattern("EEEEE"))

@Composable
private fun pattern(skeleton: String): DateTimeFormatter {
    val locale = LocalConfiguration.current.locales[0]
    return DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, skeleton), locale)
}

@Composable
internal fun clockText(
    instant: Instant,
    zone: String,
): String {
    val locale = LocalConfiguration.current.locales[0]
    val id = runCatching { ZoneId.of(zone) }.getOrDefault(ZoneId.systemDefault())
    return instant.atZone(id).format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale))
}

@Composable
internal fun timeText(time: LocalTime): String {
    val locale = LocalConfiguration.current.locales[0]
    return time.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale))
}

@Composable
internal fun durationText(minutes: Int): String {
    val hours = minutes / MINUTES_PER_HOUR
    val rest = minutes % MINUTES_PER_HOUR
    return when {
        hours == 0 -> pluralStringResource(R.plurals.review_duration_minutes, rest, rest)
        rest == 0 -> pluralStringResource(R.plurals.review_duration_hours, hours, hours)
        else -> pluralStringResource(R.plurals.review_duration_both, rest, hours, rest)
    }
}

private const val MINUTES_PER_HOUR = 60
