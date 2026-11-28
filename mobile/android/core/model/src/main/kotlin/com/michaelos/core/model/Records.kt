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
    /** Only a task session links to a task. */
    val taskId: String? = null,
    val taskTitle: String? = null,
    val eventType: CalendarEventType,
    val schedulingMode: SchedulingMode = SchedulingMode.Fixed,
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
    /** Only a task session may name one. */
    @EncodeDefault(EncodeDefault.Mode.NEVER) val taskId: String? = null,
    /** Only a task session may be flexible, so an event made outside planning is always fixed. */
    val schedulingMode: SchedulingMode = SchedulingMode.Fixed,
)

/** `GET /api/calendar/events`: every event overlapping the range. [truncated] true means some were left out. */
@Serializable
data class CalendarEventsPage(
    val events: List<CalendarEvent>,
    val truncated: Boolean = false,
)

/** An event a calendar create or move would overlap, from a 409. */
@Serializable
data class CalendarConflict(
    val eventId: String,
    val title: String,
    val startAt: Instant,
    val endAt: Instant,
)

/**
 * `PATCH /api/calendar/events/{id}`. The type cannot change; every other field is sent, [description] as null to
 * clear it. Only a task session sends [taskId], null to unlink it.
 */
@Serializable
data class CalendarEventUpdate(
    val title: String,
    val description: String?,
    val startAt: Instant,
    val endAt: Instant,
    val timeZone: String,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val taskId: TaskLink? = null,
)

/** Wraps a session's task so "unlink" (null inside) differs from "not a session" (no field). */
@Serializable(with = TaskLinkSerializer::class)
data class TaskLink(
    val id: String?,
)

/** An open task with no future session, from `GET /api/calendar/unscheduled-tasks` (at most 30, due first). */
@Serializable
data class UnscheduledTask(
    val id: String,
    val title: String,
    val priority: TaskPriority = TaskPriority.Medium,
    val estimatedDurationMinutes: Int? = null,
    val dueDate: LocalDate? = null,
)

/** `DELETE /api/calendar/events/{id}`. */
@Serializable
data class EventDeleted(
    val success: Boolean = true,
)

@Serializable
data class UnscheduledTasksResponse(
    val tasks: List<UnscheduledTask>,
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
