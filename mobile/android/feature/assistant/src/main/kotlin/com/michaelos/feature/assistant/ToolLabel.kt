package com.michaelos.feature.assistant

import androidx.annotation.StringRes

/**
 * How each assistant tool is named to the user, mirrored from the web app's src/lib/ai/tool-labels.ts for the
 * LifestyleOS tools. [label] names a source in a finished reply, [doing] is the live line while it runs, and
 * [detail] says what the tool can see.
 */
data class ToolLabel(
    @param:StringRes val label: Int,
    @param:StringRes val doing: Int,
    @param:StringRes val detail: Int,
    val kind: Kind,
) {
    enum class Kind { Read, Draft, Plan }

    companion object {
        val known: Map<String, ToolLabel> =
            mapOf(
                "get_my_tasks" to
                    ToolLabel(
                        R.string.tool_get_my_tasks_label,
                        R.string.tool_get_my_tasks_doing,
                        R.string.tool_get_my_tasks_detail,
                        Kind.Read,
                    ),
                "get_my_goals" to
                    ToolLabel(
                        R.string.tool_get_my_goals_label,
                        R.string.tool_get_my_goals_doing,
                        R.string.tool_get_my_goals_detail,
                        Kind.Read,
                    ),
                "get_my_context" to
                    ToolLabel(
                        R.string.tool_get_my_context_label,
                        R.string.tool_get_my_context_doing,
                        R.string.tool_get_my_context_detail,
                        Kind.Read,
                    ),
                "get_my_memories" to
                    ToolLabel(
                        R.string.tool_get_my_memories_label,
                        R.string.tool_get_my_memories_doing,
                        R.string.tool_get_my_memories_detail,
                        Kind.Read,
                    ),
                "draft_memory" to
                    ToolLabel(
                        R.string.tool_draft_memory_label,
                        R.string.tool_draft_memory_doing,
                        R.string.tool_draft_memory_detail,
                        Kind.Draft,
                    ),
                "get_my_habits" to
                    ToolLabel(
                        R.string.tool_get_my_habits_label,
                        R.string.tool_get_my_habits_doing,
                        R.string.tool_get_my_habits_detail,
                        Kind.Read,
                    ),
                "get_my_calendar" to
                    ToolLabel(
                        R.string.tool_get_my_calendar_label,
                        R.string.tool_get_my_calendar_doing,
                        R.string.tool_get_my_calendar_detail,
                        Kind.Read,
                    ),
                "get_daily_overview" to
                    ToolLabel(
                        R.string.tool_get_daily_overview_label,
                        R.string.tool_get_daily_overview_doing,
                        R.string.tool_get_daily_overview_detail,
                        Kind.Read,
                    ),
                "get_daily_review" to
                    ToolLabel(
                        R.string.tool_get_daily_review_label,
                        R.string.tool_get_daily_review_doing,
                        R.string.tool_get_daily_review_detail,
                        Kind.Read,
                    ),
                "get_task_priorities" to
                    ToolLabel(
                        R.string.tool_get_task_priorities_label,
                        R.string.tool_get_task_priorities_doing,
                        R.string.tool_get_task_priorities_detail,
                        Kind.Read,
                    ),
                "prepare_schedule_proposal" to
                    ToolLabel(
                        R.string.tool_prepare_schedule_proposal_label,
                        R.string.tool_prepare_schedule_proposal_doing,
                        R.string.tool_prepare_schedule_proposal_detail,
                        Kind.Plan,
                    ),
                "draft_task" to
                    ToolLabel(R.string.tool_draft_task_label, R.string.tool_draft_task_doing, R.string.tool_draft_task_detail, Kind.Draft),
                "draft_goal" to
                    ToolLabel(R.string.tool_draft_goal_label, R.string.tool_draft_goal_doing, R.string.tool_draft_goal_detail, Kind.Draft),
                "draft_habit" to
                    ToolLabel(
                        R.string.tool_draft_habit_label,
                        R.string.tool_draft_habit_doing,
                        R.string.tool_draft_habit_detail,
                        Kind.Draft,
                    ),
                "draft_calendar_event" to
                    ToolLabel(
                        R.string.tool_draft_calendar_event_label,
                        R.string.tool_draft_calendar_event_doing,
                        R.string.tool_draft_calendar_event_detail,
                        Kind.Draft,
                    ),
            )

        /** A tool this build does not know is described generically rather than by its internal name. */
        fun of(name: String): ToolLabel =
            known[name] ?: ToolLabel(R.string.tool_unknown_label, R.string.tool_unknown_doing, R.string.tool_unknown_detail, Kind.Read)
    }
}
