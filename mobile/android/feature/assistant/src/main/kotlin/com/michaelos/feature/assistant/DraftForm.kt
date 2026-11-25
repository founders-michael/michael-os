package com.michaelos.feature.assistant

import androidx.annotation.StringRes
import com.michaelos.core.model.CalendarEventCreate
import com.michaelos.core.model.CalendarEventType
import com.michaelos.core.model.DraftKind
import com.michaelos.core.model.DraftValue
import com.michaelos.core.model.GoalCreate
import com.michaelos.core.model.HabitCreate
import com.michaelos.core.model.HabitFrequency
import com.michaelos.core.model.MemoryCreate
import com.michaelos.core.model.MemorySensitivity
import com.michaelos.core.model.RecordDraft
import com.michaelos.core.model.TaskCreate
import com.michaelos.core.model.TaskPriority
import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.format.ResolverStyle

// Mirrors the web app's src/lib/ai/draft-model.ts, the one definition of what Michael may propose: the fields of each
// kind, the defaults the create schemas apply, which required fields are still empty, and the exact body the kind's
// create endpoint takes. The endpoint's own schema stays the authority on save.

data class DraftOption(
    val value: String,
    @param:StringRes val label: Int,
)

data class DraftField(
    val name: String,
    @param:StringRes val label: Int,
    val required: Boolean,
    val input: Input,
) {
    sealed interface Input {
        data class Text(
            val maxLength: Int,
        ) : Input

        data class LongText(
            val maxLength: Int,
        ) : Input

        data class Choice(
            val options: List<DraftOption>,
        ) : Input

        data object Date : Input

        data object Time : Input

        data class Number(
            val min: Int,
            val max: Int,
            @param:StringRes val unit: Int?,
        ) : Input

        data object Weekdays : Input
    }
}

/** The record the user's Save posts, one case per create endpoint. */
sealed interface DraftSubmission {
    data class Task(
        val body: TaskCreate,
    ) : DraftSubmission

    data class Goal(
        val body: GoalCreate,
    ) : DraftSubmission

    data class Habit(
        val body: HabitCreate,
    ) : DraftSubmission

    data class CalendarEvent(
        val body: CalendarEventCreate,
    ) : DraftSubmission

    data class Memory(
        val body: MemoryCreate,
    ) : DraftSubmission
}

data class DraftForm(
    val kind: DraftKind,
    val timeZone: String,
    val values: Map<String, DraftValue>,
) {
    /** The fields to show. A daily habit has no days to choose, so that field is withheld rather than ignored. */
    val fields: List<DraftField>
        get() {
            val all = DraftSpecs.fields(kind)
            return if (kind == DraftKind.Habit && !selectedDays) all.filter { it.name != "weekdays" } else all
        }

    /** Required fields still empty, with the conditional requirement the habit schema adds. */
    val missing: List<String>
        get() {
            val missing = fields.filter { it.required && isBlank(values[it.name]) }.map { it.name }
            return if (kind == DraftKind.Habit && selectedDays && isBlank(values["weekdays"])) missing + "weekdays" else missing
        }

    private val selectedDays get() = values["frequency"] == DraftValue.Text(SELECTED_DAYS)

    fun with(
        name: String,
        value: DraftValue?,
    ): DraftForm {
        val next = if (value == null) values - name else values + (name to value)
        val daily = name == "frequency" && kind == DraftKind.Habit && value != DraftValue.Text(SELECTED_DAYS)
        return copy(values = if (daily) next + ("weekdays" to DraftValue.Days(emptyList())) else next)
    }

    fun text(name: String): String = (values[name] as? DraftValue.Text)?.text.orEmpty()

    fun number(name: String): Int? = (values[name] as? DraftValue.Number)?.number

    fun days(name: String): List<Int> = (values[name] as? DraftValue.Days)?.days.orEmpty()

    /**
     * Null while a required field is empty, so a half-filled draft cannot be posted, and for an event that does not
     * end after it starts or names a wall-clock time the time zone skips.
     */
    val submission: DraftSubmission?
        get() =
            if (missing.isNotEmpty()) {
                null
            } else {
                when (kind) {
                    DraftKind.Task -> DraftSubmission.Task(taskBody())
                    DraftKind.Goal -> DraftSubmission.Goal(goalBody())
                    DraftKind.Habit -> DraftSubmission.Habit(habitBody())
                    DraftKind.CalendarEvent -> calendarBody()?.let(DraftSubmission::CalendarEvent)
                    DraftKind.Memory -> DraftSubmission.Memory(memoryBody())
                    DraftKind.Unknown -> null
                }
            }

    private fun taskBody() =
        TaskCreate(
            title = trimmed("title").orEmpty(),
            priority = TaskPriority.entries.firstOrNull { it.wire == text("priority") } ?: TaskPriority.Medium,
            description = trimmed("description"),
            dueDate = date("dueDate"),
            estimatedDurationMinutes = number("estimatedDurationMinutes"),
        )

    private fun goalBody() =
        GoalCreate(
            title = trimmed("title").orEmpty(),
            progress = number("progress") ?: 0,
            description = trimmed("description"),
            category = trimmed("category"),
            targetDate = date("targetDate"),
        )

    private fun habitBody(): HabitCreate {
        val start = time("startTime")
        val end = time("endTime")
        return HabitCreate(
            title = trimmed("title").orEmpty(),
            frequency = if (selectedDays) HabitFrequency.SelectedDays else HabitFrequency.Daily,
            weekdays = if (selectedDays) days("weekdays") else emptyList(),
            description = trimmed("description"),
            startTime = start,
            // An end time is only valid with a start time, and one equal to the start means none.
            endTime = end.takeIf { start != null && it != start },
        )
    }

    private fun calendarBody(): CalendarEventCreate? {
        val date = date("date")
        val start = date?.let { day -> time("startTime")?.let { instant(day, it, timeZone) } }
        val end = date?.let { day -> time("endTime")?.let { instant(day, it, timeZone) } }
        if (start == null || end == null || !start.isBefore(end)) return null
        return CalendarEventCreate(
            title = trimmed("title").orEmpty(),
            eventType = CalendarEventType.entries.firstOrNull { it.wire == text("eventType") } ?: CalendarEventType.Commitment,
            startAt = start,
            endAt = end,
            timeZone = timeZone,
            description = trimmed("description"),
        )
    }

    private fun memoryBody() =
        MemoryCreate(
            content = trimmed("content").orEmpty(),
            sensitivity = MemorySensitivity.entries.firstOrNull { it.wire == text("sensitivity") } ?: MemorySensitivity.Standard,
            keepUntil = date("keepUntil"),
        )

    private fun trimmed(name: String): String? = text(name).trim().ifEmpty { null }

    fun date(name: String): LocalDate? =
        try {
            LocalDate.parse(text(name), DateTimeFormatter.ISO_LOCAL_DATE)
        } catch (_: DateTimeParseException) {
            null
        }

    fun time(name: String): LocalTime? =
        try {
            LocalTime.parse(text(name), TIME)
        } catch (_: DateTimeParseException) {
            null
        }

    private fun isBlank(value: DraftValue?): Boolean =
        when (value) {
            null -> true
            is DraftValue.Text -> value.text.isBlank()
            is DraftValue.Days -> value.days.isEmpty()
            is DraftValue.Number -> false
        }

    companion object {
        private const val SELECTED_DAYS = "SELECTED_DAYS"
        private val TIME = DateTimeFormatter.ofPattern("HH:mm").withResolverStyle(ResolverStyle.STRICT)

        fun of(draft: RecordDraft): DraftForm {
            val values = DraftSpecs.defaults(draft.kind) + draft.values
            // A daily habit takes no weekdays; the create schema refuses them.
            val daily = draft.kind == DraftKind.Habit && values["frequency"] != DraftValue.Text(SELECTED_DAYS)
            return DraftForm(draft.kind, draft.timeZone, if (daily) values + ("weekdays" to DraftValue.Days(emptyList())) else values)
        }

        /** The instant a wall-clock time on a date has in [zone]; null when a clock change skips that time. */
        fun instant(
            date: LocalDate,
            time: LocalTime,
            zone: String,
        ): Instant? {
            val id =
                try {
                    ZoneId.of(zone)
                } catch (_: DateTimeException) {
                    return null
                }
            val wanted = LocalDateTime.of(date, time)
            return id.rules
                .getValidOffsets(wanted)
                .firstOrNull()
                ?.let { wanted.toInstant(it) }
        }

        /** Server field names on a 400, as the form's fields: an event's instants are entered as times. */
        fun fieldFor(serverField: String): String =
            when (serverField) {
                "startAt" -> "startTime"
                "endAt" -> "endTime"
                else -> serverField
            }
    }
}
