package com.michaelos.feature.tasks

import com.michaelos.core.model.FieldChange
import com.michaelos.core.model.RecurrenceFrequency
import com.michaelos.core.model.RecurrenceRule
import com.michaelos.core.model.ReminderTime
import com.michaelos.core.model.Task
import com.michaelos.core.model.TaskPriority
import com.michaelos.core.model.TaskRecurrence
import com.michaelos.core.model.TaskSave
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

/** The task editor's fields. Limits mirror `task-validation.ts`; the server checks them again. */
data class TaskForm(
    val title: String = "",
    val notes: String = "",
    val priority: TaskPriority = TaskPriority.Medium,
    val dueDate: LocalDate? = null,
    /** Digits as typed, so "4" can be on its way to "45" without an error. */
    val estimate: String = "",
    val remaining: String = "",
    val repeat: RepeatDraft = RepeatDraft(),
    val reminderDate: LocalDate? = null,
    val reminderTime: LocalTime? = null,
) {
    enum class Field(
        val wire: String,
    ) {
        Title("title"),
        Description("description"),
        Estimate("estimatedDurationMinutes"),
        Remaining("remainingDurationMinutes"),
        DueDate("dueDate"),
        Recurrence("recurrence"),
        Reminder("reminder"),
    }

    enum class Problem { TitleMissing, MinutesOutOfRange, RepeatNeedsDueDate, RepeatNeedsWeekday, EndsBeforeDueDate, ReminderHalfSet }

    /** What is wrong before anything is sent, by field. Empty when the form can be saved. */
    val problems: Map<Field, Problem>
        get() =
            buildMap {
                if (title.isBlank()) put(Field.Title, Problem.TitleMissing)
                if (!validMinutes(estimate)) put(Field.Estimate, Problem.MinutesOutOfRange)
                if (!validMinutes(remaining)) put(Field.Remaining, Problem.MinutesOutOfRange)
                repeat.rule(dueDate)?.let { rule ->
                    val ends = rule.endsOn
                    when {
                        dueDate == null -> {
                            put(Field.Recurrence, Problem.RepeatNeedsDueDate)
                        }

                        rule.frequency == RecurrenceFrequency.Weekly && rule.weekdays.isEmpty() -> {
                            put(
                                Field.Recurrence,
                                Problem.RepeatNeedsWeekday,
                            )
                        }

                        ends != null && ends.isBefore(dueDate) -> {
                            put(Field.Recurrence, Problem.EndsBeforeDueDate)
                        }
                    }
                }
                if ((reminderDate == null) != (reminderTime == null)) put(Field.Reminder, Problem.ReminderHalfSet)
            }

    private val reminder: ReminderTime?
        get() = if (reminderDate != null && reminderTime != null) ReminderTime(reminderDate, reminderTime) else null

    /**
     * The save, or null while the form has problems. The repeat and the reminder are sent only when they differ from what
     * the task had ([saved]), as the web form does.
     */
    fun save(saved: TaskForm?): TaskSave? {
        if (problems.isNotEmpty()) return null
        val rule = repeat.rule(dueDate)
        val savedRule = saved?.let { it.repeat.rule(it.dueDate) }
        val recurrence: FieldChange<RecurrenceRule>? =
            when {
                rule == savedRule -> null
                rule != null -> FieldChange.Set(rule)
                else -> FieldChange.Clear
            }
        val current = reminder
        val reminderChange: FieldChange<ReminderTime>? =
            when {
                current == saved?.reminder -> null
                current != null -> FieldChange.Set(current)
                else -> FieldChange.Clear
            }
        return TaskSave(
            title = title.trim(),
            description = notes.trim().ifEmpty { null },
            priority = priority,
            estimatedDurationMinutes = estimate.toIntOrNull(),
            remainingDurationMinutes = remaining.toIntOrNull(),
            dueDate = dueDate,
            recurrence = recurrence,
            reminder = reminderChange,
        )
    }

    companion object {
        const val TITLE_LIMIT = 160
        const val NOTES_LIMIT = 5000
        private val MINUTES = 5..1440

        /** The form for an existing task. A reminder already sent starts empty, so a new one can be set. */
        fun of(
            task: Task,
            zone: ZoneId,
        ): TaskForm {
            val clock = task.remindAt?.takeUnless { task.reminderSent }?.atZone(zone)
            return TaskForm(
                title = task.title,
                notes = task.description.orEmpty(),
                priority = task.priority.takeUnless { it == TaskPriority.Unknown } ?: TaskPriority.Medium,
                dueDate = task.dueDate,
                estimate = task.estimatedDurationMinutes?.toString().orEmpty(),
                remaining = task.remainingDurationMinutes?.toString().orEmpty(),
                repeat = RepeatDraft.of(task.activeRecurrence),
                reminderDate = clock?.toLocalDate(),
                reminderTime = clock?.toLocalTime()?.withSecond(0)?.withNano(0),
            )
        }

        private fun validMinutes(text: String): Boolean = text.isEmpty() || text.toIntOrNull()?.let { it in MINUTES } == true
    }
}

/** The Repeat field: presets for the common cases, Custom for the rest (`recurrence-form.ts`). Presets take their day from the due date. */
data class RepeatDraft(
    val preset: Preset = Preset.None,
    val frequency: RecurrenceFrequency = RecurrenceFrequency.Weekly,
    val interval: Int = 1,
    val weekdays: Set<Int> = emptySet(),
    val monthDay: Int = 1,
    val endsOn: LocalDate? = null,
) {
    enum class Preset { None, Daily, Weekdays, Weekly, Monthly, Custom }

    fun rule(dueDate: LocalDate?): RecurrenceRule? =
        when (preset) {
            Preset.None -> {
                null
            }

            Preset.Daily -> {
                RecurrenceRule(RecurrenceFrequency.Daily, 1, emptyList(), null, null)
            }

            Preset.Weekdays -> {
                RecurrenceRule(RecurrenceFrequency.Weekly, 1, WORKDAYS, null, null)
            }

            Preset.Weekly -> {
                RecurrenceRule(RecurrenceFrequency.Weekly, 1, listOfNotNull(dueDate?.dayOfWeek?.value), null, null)
            }

            Preset.Monthly -> {
                RecurrenceRule(RecurrenceFrequency.Monthly, 1, emptyList(), dueDate?.dayOfMonth ?: 1, null)
            }

            Preset.Custom -> {
                val unit = frequency.takeUnless { it == RecurrenceFrequency.Unknown } ?: RecurrenceFrequency.Weekly
                RecurrenceRule(
                    frequency = unit,
                    interval = interval.coerceIn(INTERVALS),
                    weekdays = if (unit == RecurrenceFrequency.Weekly) weekdays.sorted() else emptyList(),
                    monthDay = if (unit == RecurrenceFrequency.Monthly) monthDay else null,
                    endsOn = endsOn,
                )
            }
        }

    companion object {
        val INTERVALS = 1..99
        val MONTH_DAYS = 1..31
        private val WORKDAYS = listOf(1, 2, 3, 4, 5)

        /** The closest preset for a saved repeat, or Custom. */
        fun of(recurrence: TaskRecurrence?): RepeatDraft {
            if (recurrence == null) return RepeatDraft()
            val preset =
                when {
                    recurrence.endsOn != null || recurrence.interval != 1 -> Preset.Custom
                    recurrence.frequency == RecurrenceFrequency.Daily -> Preset.Daily
                    recurrence.frequency == RecurrenceFrequency.Monthly -> Preset.Monthly
                    recurrence.weekdays == WORKDAYS -> Preset.Weekdays
                    recurrence.weekdays.size == 1 -> Preset.Weekly
                    else -> Preset.Custom
                }
            return RepeatDraft(
                preset = preset,
                frequency = recurrence.frequency,
                interval = recurrence.interval,
                weekdays = recurrence.weekdays.toSet(),
                monthDay = recurrence.monthDay ?: 1,
                endsOn = recurrence.endsOn,
            )
        }
    }
}
