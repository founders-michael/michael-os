package com.michaelos.feature.assistant

import androidx.annotation.StringRes
import com.michaelos.core.model.DraftKind
import com.michaelos.core.model.DraftValue
import com.michaelos.feature.assistant.DraftField.Input

// The field specs and defaults of src/lib/ai/draft-model.ts. Required means required to save: it matches the create
// schema's own required set.
internal object DraftSpecs {
    // The create schemas' limits.
    private const val TITLE = 160
    private const val NOTES = 5000
    private const val HABIT_NOTES = 2000
    private const val CATEGORY = 80
    private const val MEMORY = 280
    private const val ESTIMATE_MIN = 5
    private const val ESTIMATE_MAX = 1440
    private const val PERCENT = 100

    private val priority =
        listOf(
            DraftOption("LOW", R.string.draft_option_priority_low),
            DraftOption("MEDIUM", R.string.draft_option_priority_medium),
            DraftOption("HIGH", R.string.draft_option_priority_high),
        )

    private val frequency =
        listOf(
            DraftOption("DAILY", R.string.draft_option_frequency_daily),
            DraftOption("SELECTED_DAYS", R.string.draft_option_frequency_selected_days),
        )

    private val eventType =
        listOf(
            DraftOption("COMMITMENT", R.string.draft_option_event_type_commitment),
            DraftOption("UNAVAILABLE", R.string.draft_option_event_type_unavailable),
        )

    private val sensitivity =
        listOf(
            DraftOption("STANDARD", R.string.draft_option_sensitivity_standard),
            DraftOption("PERSONAL", R.string.draft_option_sensitivity_personal),
            DraftOption("SENSITIVE", R.string.draft_option_sensitivity_sensitive),
        )

    private fun field(
        name: String,
        @StringRes label: Int,
        input: Input,
        required: Boolean = false,
    ) = DraftField(name, label, required, input)

    private val byKind: Map<DraftKind, List<DraftField>> =
        mapOf(
            DraftKind.Task to
                listOf(
                    field("title", R.string.draft_field_task_title, Input.Text(TITLE), required = true),
                    field("description", R.string.draft_field_task_description, Input.LongText(NOTES)),
                    field("priority", R.string.draft_field_task_priority, Input.Choice(priority), required = true),
                    field("dueDate", R.string.draft_field_task_due_date, Input.Date),
                    field(
                        "estimatedDurationMinutes",
                        R.string.draft_field_task_estimated_duration_minutes,
                        Input.Number(ESTIMATE_MIN, ESTIMATE_MAX, R.string.draft_unit_minutes),
                    ),
                ),
            DraftKind.Goal to
                listOf(
                    field("title", R.string.draft_field_goal_title, Input.Text(TITLE), required = true),
                    field("description", R.string.draft_field_goal_description, Input.LongText(NOTES)),
                    field("category", R.string.draft_field_goal_category, Input.Text(CATEGORY)),
                    field("targetDate", R.string.draft_field_goal_target_date, Input.Date),
                    field("progress", R.string.draft_field_goal_progress, Input.Number(0, PERCENT, R.string.draft_unit_percent)),
                ),
            DraftKind.Habit to
                listOf(
                    field("title", R.string.draft_field_habit_title, Input.Text(TITLE), required = true),
                    field("description", R.string.draft_field_habit_description, Input.LongText(HABIT_NOTES)),
                    field("frequency", R.string.draft_field_habit_frequency, Input.Choice(frequency), required = true),
                    field("weekdays", R.string.draft_field_habit_weekdays, Input.Weekdays),
                    field("startTime", R.string.draft_field_habit_start_time, Input.Time),
                    field("endTime", R.string.draft_field_habit_end_time, Input.Time),
                ),
            DraftKind.CalendarEvent to
                listOf(
                    field("title", R.string.draft_field_calendar_event_title, Input.Text(TITLE), required = true),
                    field("description", R.string.draft_field_calendar_event_description, Input.LongText(NOTES)),
                    field("eventType", R.string.draft_field_calendar_event_event_type, Input.Choice(eventType), required = true),
                    field("date", R.string.draft_field_calendar_event_date, Input.Date, required = true),
                    field("startTime", R.string.draft_field_calendar_event_start_time, Input.Time, required = true),
                    field("endTime", R.string.draft_field_calendar_event_end_time, Input.Time, required = true),
                ),
            DraftKind.Memory to
                listOf(
                    field("content", R.string.draft_field_memory_content, Input.LongText(MEMORY), required = true),
                    field("sensitivity", R.string.draft_field_memory_sensitivity, Input.Choice(sensitivity), required = true),
                    field("keepUntil", R.string.draft_field_memory_keep_until, Input.Date),
                ),
        )

    fun fields(kind: DraftKind): List<DraftField> = byKind[kind].orEmpty()

    /** The defaults the create schemas apply, so the form opens consistent with them. */
    fun defaults(kind: DraftKind): Map<String, DraftValue> =
        when (kind) {
            DraftKind.Task -> mapOf("priority" to DraftValue.Text("MEDIUM"))
            DraftKind.Goal -> mapOf("progress" to DraftValue.Number(0))
            DraftKind.Habit -> mapOf("frequency" to DraftValue.Text("DAILY"), "weekdays" to DraftValue.Days(emptyList()))
            DraftKind.CalendarEvent -> mapOf("eventType" to DraftValue.Text("COMMITMENT"))
            DraftKind.Memory -> mapOf("sensitivity" to DraftValue.Text("STANDARD"))
            DraftKind.Unknown -> emptyMap()
        }
}
