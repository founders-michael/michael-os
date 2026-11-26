@file:UseSerializers(InstantSerializer::class, LocalDateSerializer::class, LocalTimeSerializer::class)

package com.michaelos.core.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.UseSerializers
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.descriptors.buildClassSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime

@Serializable
data class Task(
    val id: String,
    val title: String,
    val description: String? = null,
    val status: TaskStatus,
    val priority: TaskPriority,
    val estimatedDurationMinutes: Int? = null,
    val remainingDurationMinutes: Int? = null,
    val dueDate: LocalDate? = null,
    val completedAt: Instant? = null,
    val createdAt: Instant,
    val updatedAt: Instant,
    /** Kept when a repeat is stopped, with `active` false. */
    val recurrence: TaskRecurrence? = null,
    val remindAt: Instant? = null,
    val reminderSent: Boolean = false,
) {
    /** The repeat, when it still runs. */
    val activeRecurrence: TaskRecurrence? get() = recurrence?.takeIf { it.active }

    /** A reminder still to come. */
    val pendingReminder: Instant? get() = remindAt.takeUnless { reminderSent || status == TaskStatus.Completed }
}

@Serializable(with = RecurrenceFrequencySerializer::class)
enum class RecurrenceFrequency(
    override val wire: String,
) : OpenEnum {
    Daily("DAILY"),
    Weekly("WEEKLY"),
    Monthly("MONTHLY"),
    Unknown("unknown"),
}

internal object RecurrenceFrequencySerializer :
    OpenEnumSerializer<RecurrenceFrequency>("RecurrenceFrequency", RecurrenceFrequency.entries, RecurrenceFrequency.Unknown)

/** A task's repeat as the server returns it. `label` is the server's wording ("Every Mon, Thu"). */
@Serializable
data class TaskRecurrence(
    val frequency: RecurrenceFrequency,
    val interval: Int,
    val weekdays: List<Int> = emptyList(),
    val monthDay: Int? = null,
    val endsOn: LocalDate? = null,
    val active: Boolean,
    val label: String,
) {
    val rule: RecurrenceRule get() = RecurrenceRule(frequency, interval, weekdays, monthDay, endsOn)
}

/** The repeat the server validates (`recurrence.ts`): weekdays only for weekly, a month day only for monthly. */
@Serializable
data class RecurrenceRule(
    val frequency: RecurrenceFrequency,
    val interval: Int,
    val weekdays: List<Int>,
    val monthDay: Int?,
    val endsOn: LocalDate?,
) {
    fun normalized(): RecurrenceRule = copy(weekdays = weekdays.sorted())
}

/** "Remind me" as the person sets it: a date and time on the profile's clock. The server converts it. */
@Serializable
data class ReminderTime(
    val date: LocalDate,
    val time: LocalTime,
)

/** A field a save changes: a new value, or cleared to null. A field the save leaves alone is not sent at all. */
sealed interface FieldChange<out T> {
    data class Set<T>(
        val value: T,
    ) : FieldChange<T>

    data object Clear : FieldChange<Nothing>
}

/**
 * The task form's save, for `POST /api/tasks` and `PATCH /api/tasks/{id}`. The plain fields are always sent, null when
 * empty, as the web form does; the repeat and the reminder only when they changed.
 */
@Serializable(with = TaskSaveSerializer::class)
data class TaskSave(
    val title: String,
    val description: String?,
    val priority: TaskPriority,
    val estimatedDurationMinutes: Int?,
    val remainingDurationMinutes: Int?,
    val dueDate: LocalDate?,
    val recurrence: FieldChange<RecurrenceRule>?,
    val reminder: FieldChange<ReminderTime>?,
)

internal object TaskSaveSerializer : KSerializer<TaskSave> {
    override val descriptor: SerialDescriptor = buildClassSerialDescriptor("TaskSave")

    override fun serialize(
        encoder: Encoder,
        value: TaskSave,
    ) {
        val json = (encoder as JsonEncoder).json
        val body =
            buildJsonObject {
                put("title", JsonPrimitive(value.title))
                put("description", JsonPrimitive(value.description))
                put("priority", JsonPrimitive(value.priority.wire))
                put("estimatedDurationMinutes", JsonPrimitive(value.estimatedDurationMinutes))
                put("remainingDurationMinutes", JsonPrimitive(value.remainingDurationMinutes))
                put("dueDate", JsonPrimitive(value.dueDate?.toString()))
                when (val change = value.recurrence) {
                    is FieldChange.Set -> put("recurrence", json.encodeToJsonElement(RecurrenceRule.serializer(), change.value))
                    FieldChange.Clear -> put("recurrence", JsonNull)
                    null -> Unit
                }
                when (val change = value.reminder) {
                    is FieldChange.Set -> put("reminder", json.encodeToJsonElement(ReminderTime.serializer(), change.value))
                    FieldChange.Clear -> put("reminder", JsonNull)
                    null -> Unit
                }
            }
        encoder.encodeJsonElement(body)
    }

    override fun deserialize(decoder: Decoder): TaskSave = error("TaskSave is only sent")
}

/** The list's filters (`taskListQuerySchema`). The server refuses a status that contradicts the view, so the apps never send one. */
data class TaskQuery(
    val view: TaskView = TaskView.All,
    val priority: TaskPriority? = null,
    val sort: TaskSort = TaskSort.Recent,
    val search: String = "",
    val page: Int = 1,
) {
    val parameters: List<Pair<String, String>>
        get() =
            buildList {
                add("view" to view.wire)
                add("sort" to sort.wire)
                add("page" to page.toString())
                add("limit" to PAGE_SIZE.toString())
                priority?.let { add("priority" to it.wire) }
                search
                    .trim()
                    .take(SEARCH_LIMIT)
                    .takeIf { it.isNotEmpty() }
                    ?.let { add("search" to it) }
            }

    companion object {
        const val PAGE_SIZE = 30
        private const val SEARCH_LIMIT = 100
    }
}

enum class TaskView(
    val wire: String,
) {
    All("all"),
    Pending("pending"),
    Completed("completed"),
    Overdue("overdue"),
}

enum class TaskSort(
    val wire: String,
) {
    Recent("recent"),
    DueDate("dueDate"),
    Priority("priority"),
}

@Serializable
data class TaskSummaryResponse(
    val summary: TaskSummary,
)

@Serializable
data class TaskDeleted(
    val success: Boolean,
)

@Serializable(with = TaskStatusSerializer::class)
enum class TaskStatus(
    override val wire: String,
) : OpenEnum {
    Todo("TODO"),
    InProgress("IN_PROGRESS"),
    Completed("COMPLETED"),
    Unknown("unknown"),
}

internal object TaskStatusSerializer : OpenEnumSerializer<TaskStatus>("TaskStatus", TaskStatus.entries, TaskStatus.Unknown)

@Serializable(with = TaskPrioritySerializer::class)
enum class TaskPriority(
    override val wire: String,
) : OpenEnum {
    Low("LOW"),
    Medium("MEDIUM"),
    High("HIGH"),
    Unknown("unknown"),
}

internal object TaskPrioritySerializer : OpenEnumSerializer<TaskPriority>("TaskPriority", TaskPriority.entries, TaskPriority.Unknown)

@Serializable
data class TaskResponse(
    val task: Task,
)

/** `PATCH /api/tasks/{id}`. The server refuses unknown fields, so only what changes is sent. */
@Serializable
data class TaskUpdate(
    val status: TaskStatus,
)

@Serializable
data class TaskPage(
    val tasks: List<Task>,
    val page: Int,
    val limit: Int,
    val total: Int,
    val pages: Int,
)
