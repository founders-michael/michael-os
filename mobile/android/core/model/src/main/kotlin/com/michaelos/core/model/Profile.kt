@file:UseSerializers(InstantSerializer::class, LocalTimeSerializer::class)

package com.michaelos.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.UseSerializers
import java.time.Instant
import java.time.LocalTime

@Serializable
data class Profile(
    val userId: String,
    val preferredName: String,
    val timeZone: String,
    val wakeUpTime: LocalTime,
    val bedtime: LocalTime,
    val workStartTime: LocalTime? = null,
    val workEndTime: LocalTime? = null,
    val workDays: List<DayOfWeek>,
    val priorities: List<String>,
    val focusSessionMinutes: Int,
    val breakDurationMinutes: Int,
    val planningStyle: PlanningStyle,
    val onboardingStep: Int,
    val onboardingCompleted: Boolean,
    val createdAt: Instant,
    val updatedAt: Instant,
)

/** `profile` is null until onboarding saves its first step. */
@Serializable
data class ProfileResponse(
    val profile: Profile? = null,
)

@Serializable(with = DayOfWeekSerializer::class)
enum class DayOfWeek(
    override val wire: String,
) : OpenEnum {
    Monday("MONDAY"),
    Tuesday("TUESDAY"),
    Wednesday("WEDNESDAY"),
    Thursday("THURSDAY"),
    Friday("FRIDAY"),
    Saturday("SATURDAY"),
    Sunday("SUNDAY"),
    Unknown("unknown"),
}

internal object DayOfWeekSerializer : OpenEnumSerializer<DayOfWeek>("DayOfWeek", DayOfWeek.entries, DayOfWeek.Unknown)

@Serializable(with = PlanningStyleSerializer::class)
enum class PlanningStyle(
    override val wire: String,
) : OpenEnum {
    Structured("STRUCTURED"),
    Balanced("BALANCED"),
    Flexible("FLEXIBLE"),
    Unknown("unknown"),
}

internal object PlanningStyleSerializer :
    OpenEnumSerializer<PlanningStyle>("PlanningStyle", PlanningStyle.entries, PlanningStyle.Unknown)
