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
