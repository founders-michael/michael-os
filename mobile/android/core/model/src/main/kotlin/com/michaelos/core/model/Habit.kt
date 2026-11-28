@file:UseSerializers(InstantSerializer::class, LocalDateSerializer::class, LocalTimeSerializer::class)

package com.michaelos.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.UseSerializers
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime

@Serializable
data class Habit(
    val id: String,
    val title: String,
    val description: String? = null,
    val frequency: HabitFrequency,
    /** ISO weekdays, 1 for Monday to 7 for Sunday. Empty for a daily habit. */
    val weekdays: List<Int>,
    val status: HabitStatus,
    val startTime: LocalTime? = null,
    val endTime: LocalTime? = null,
    val today: LocalDate,
    val todayScheduled: Boolean,
    val completedToday: Boolean,
    val currentStreak: Int,
    val bestStreak: Int,
    val completionPercentage: Int,
    val eligibleDays: Int,
    val completedDays: Int,
    val periodStart: LocalDate,
    val periodEnd: LocalDate,
    /** The last 30 days. */
    val checkIns: List<HabitCheckIn>,
    val createdAt: Instant,
    val updatedAt: Instant,
)

@Serializable(with = HabitFrequencySerializer::class)
enum class HabitFrequency(
    override val wire: String,
) : OpenEnum {
    Daily("DAILY"),
    SelectedDays("SELECTED_DAYS"),
    Unknown("unknown"),
}

internal object HabitFrequencySerializer :
    OpenEnumSerializer<HabitFrequency>("HabitFrequency", HabitFrequency.entries, HabitFrequency.Unknown)

@Serializable(with = HabitStatusSerializer::class)
enum class HabitStatus(
    override val wire: String,
) : OpenEnum {
    Active("ACTIVE"),
    Archived("ARCHIVED"),
    Unknown("unknown"),
}

internal object HabitStatusSerializer : OpenEnumSerializer<HabitStatus>("HabitStatus", HabitStatus.entries, HabitStatus.Unknown)

@Serializable
data class HabitCheckIn(
    val id: String,
    val localDate: LocalDate,
    val completedAt: Instant,
)

/** `POST /api/habits/{id}/check-ins`. A repeated check-in answers with the existing one and [alreadyCompleted]. */
@Serializable
data class CheckInResponse(
    val checkIn: HabitCheckIn,
    val alreadyCompleted: Boolean,
)

@Serializable
data class CheckInRequest(
    val localDate: LocalDate,
)

@Serializable
data class SuccessResponse(
    val success: Boolean,
)

/** Whether the habit was checked in on [date], from the last 30 days. */
fun Habit.isDoneOn(date: LocalDate): Boolean = checkIns.any { it.localDate == date }

/** Whether the schedule has the habit on [date], by weekday. The server's `todayScheduled` rules for today. */
fun Habit.isScheduledOn(date: LocalDate): Boolean = frequency == HabitFrequency.Daily || date.dayOfWeek.value in weekdays

/** A scheduled day inside the stats period, before today, without a check-in: what the server counts against the habit. */
fun Habit.isMissedOn(date: LocalDate): Boolean = date >= periodStart && date < today && isScheduledOn(date) && !isDoneOn(date)

/**
 * The habit form's save, for `POST /api/habits` and `PATCH /api/habits/{id}`. Every field is sent, null when empty, so
 * clearing a time or the notes reaches the server.
 */
@Serializable
data class HabitSave(
    val title: String,
    val description: String?,
    val frequency: HabitFrequency,
    val weekdays: List<Int>,
    val startTime: LocalTime?,
    val endTime: LocalTime?,
)

/** `PATCH /api/habits/{id}` that archives or reactivates. */
@Serializable
data class HabitStatusChange(
    val status: HabitStatus,
)

@Serializable
data class HabitList(
    val habits: List<Habit>,
)
