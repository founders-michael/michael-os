@file:UseSerializers(InstantSerializer::class, LocalDateSerializer::class, LocalTimeSerializer::class)
@file:OptIn(ExperimentalSerializationApi::class)

package com.michaelos.core.model

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.UseSerializers
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime

// Create bodies leave an empty optional field out, as the web's draft form does; `apiJson` encodes defaults, so
// each optional field says so.

/** `POST /api/tasks`. */
@Serializable
data class TaskCreate(
    val title: String,
    val priority: TaskPriority,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val description: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val dueDate: LocalDate? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val estimatedDurationMinutes: Int? = null,
)

@Serializable
data class Goal(
    val id: String,
    val title: String,
    val description: String? = null,
    val category: String? = null,
    val status: GoalStatus,
    val progress: Int,
    val targetDate: LocalDate? = null,
    val completedAt: Instant? = null,
    val milestoneCount: Int,
    val completedMilestoneCount: Int,
    val createdAt: Instant,
    val updatedAt: Instant,
)

@Serializable(with = GoalStatusSerializer::class)
enum class GoalStatus(
    override val wire: String,
) : OpenEnum {
    Active("ACTIVE"),
    Completed("COMPLETED"),
    Archived("ARCHIVED"),
    Unknown("unknown"),
}

internal object GoalStatusSerializer : OpenEnumSerializer<GoalStatus>("GoalStatus", GoalStatus.entries, GoalStatus.Unknown)

@Serializable
data class GoalResponse(
    val goal: Goal,
)

/** `POST /api/goals`. */
@Serializable
data class GoalCreate(
    val title: String,
    val progress: Int,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val description: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val category: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val targetDate: LocalDate? = null,
)

@Serializable
data class HabitResponse(
    val habit: Habit,
)

/** `POST /api/habits`. A daily habit sends no weekdays; an end time is only valid with a start time. */
@Serializable
data class HabitCreate(
    val title: String,
    val frequency: HabitFrequency,
    val weekdays: List<Int>,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val description: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val startTime: LocalTime? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val endTime: LocalTime? = null,
)

@Serializable
data class CalendarEvent(
    val id: String,
    val taskId: String? = null,
    val eventType: CalendarEventType,
    val schedulingMode: SchedulingMode,
    val title: String,
    val description: String? = null,
    val startAt: Instant,
    val endAt: Instant,
    val timeZone: String,
)

@Serializable(with = CalendarEventTypeSerializer::class)
enum class CalendarEventType(
    override val wire: String,
) : OpenEnum {
    TaskSession("TASK_SESSION"),
    Commitment("COMMITMENT"),
    Unavailable("UNAVAILABLE"),
    Unknown("unknown"),
}

internal object CalendarEventTypeSerializer :
    OpenEnumSerializer<CalendarEventType>("CalendarEventType", CalendarEventType.entries, CalendarEventType.Unknown)

@Serializable(with = SchedulingModeSerializer::class)
enum class SchedulingMode(
    override val wire: String,
) : OpenEnum {
    Fixed("FIXED"),
    Flexible("FLEXIBLE"),
    Unknown("unknown"),
}

internal object SchedulingModeSerializer : OpenEnumSerializer<SchedulingMode>(
    "SchedulingMode",
    SchedulingMode.entries,
    SchedulingMode.Unknown,
)

@Serializable
data class CalendarEventResponse(
    val event: CalendarEvent,
)

/** `POST /api/calendar/events`. Overlapping another event is refused with 409. */
@Serializable
data class CalendarEventCreate(
    val title: String,
    val eventType: CalendarEventType,
    val startAt: Instant,
    val endAt: Instant,
    val timeZone: String,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val description: String? = null,
    /** Only a task session may be flexible, so an event made outside planning is always fixed. */
    val schedulingMode: SchedulingMode = SchedulingMode.Fixed,
)

@Serializable(with = MemorySensitivitySerializer::class)
enum class MemorySensitivity(
    override val wire: String,
) : OpenEnum {
    Standard("STANDARD"),
    Personal("PERSONAL"),
    Sensitive("SENSITIVE"),
    Unknown("unknown"),
}

internal object MemorySensitivitySerializer :
    OpenEnumSerializer<MemorySensitivity>("MemorySensitivity", MemorySensitivity.entries, MemorySensitivity.Unknown)

@Serializable
data class Memory(
    val id: String,
    val content: String,
    val sensitivity: MemorySensitivity,
    val keepUntil: LocalDate? = null,
)

@Serializable
data class MemoryResponse(
    val memory: Memory,
)

/** `POST /api/memories`. Without `keepUntil` the memory is kept until deleted. */
@Serializable
data class MemoryCreate(
    val content: String,
    val sensitivity: MemorySensitivity,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val keepUntil: LocalDate? = null,
)
