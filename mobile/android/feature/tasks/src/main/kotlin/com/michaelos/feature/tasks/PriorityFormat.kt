package com.michaelos.feature.tasks

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import com.michaelos.core.model.PriorityReason
import com.michaelos.core.model.RankedTask
import com.michaelos.core.model.TaskPriority

/**
 * Michael's ranking in words, mirrored from the web's `src/lib/task-priority-format.ts`: the same reason codes, the same
 * rule for the one-line why, the component labels from `shared/intelligence/prioritization.json`.
 */
internal data class BreakdownRow(
    val label: String,
    val reason: String,
    val points: Double?,
)

/** Reasons that need no values. */
private val FIXED =
    mapOf(
        "DUE_TODAY" to R.string.tasks_why_due_today,
        "NO_DUE_DATE" to R.string.tasks_why_no_due_date,
        "NOT_ALIGNED" to R.string.tasks_why_not_aligned,
        "BLOCKS_NOTHING" to R.string.tasks_why_blocks_nothing,
        "NO_ESTIMATE" to R.string.tasks_why_no_estimate,
        "NEVER_POSTPONED" to R.string.tasks_why_never_postponed,
        "STATUS_BLOCKED" to R.string.tasks_why_status_blocked,
    )

/** Reasons that count something, worded by one plural. */
private val COUNTED =
    mapOf(
        "OVERDUE" to (R.plurals.tasks_why_overdue to "days"),
        "BLOCKS_TASKS" to (R.plurals.tasks_why_blocks to "count"),
        "POSTPONED" to (R.plurals.tasks_why_postponed to "count"),
        "WAITING_ON_BLOCKERS" to (R.plurals.tasks_why_waiting to "count"),
    )

/** One component's reason as a short phrase; null when it says nothing worth showing. */
@Composable
internal fun reasonText(reason: PriorityReason): String? {
    val n = { key: String -> reason.numbers[key]?.toInt() ?: 0 }
    FIXED[reason.code]?.let { return stringResource(it) }
    COUNTED[reason.code]?.let { (plural, key) -> return pluralStringResource(plural, n(key), n(key)) }
    return when (reason.code) {
        "PRIORITY" -> {
            val priority =
                reason.strings["priority"]?.let { name ->
                    TaskPriority.entries.firstOrNull { it.wire.equals(name, ignoreCase = true) }
                }
            stringResource(R.string.tasks_why_priority, priorityText(priority ?: TaskPriority.Medium))
        }

        "DUE_IN" -> {
            stringResource(R.string.tasks_why_due_in, inDays(n("days")))
        }

        "SUPPORTS_GOALS" -> {
            supportsGoals(reason, n("count"))
        }

        "EFFORT_VS_TIME" -> {
            effort(n("minutes"), n("daysLeft"))
        }

        else -> {
            null
        }
    }
}

@Composable
private fun supportsGoals(
    reason: PriorityReason,
    count: Int,
): String {
    val goals = pluralStringResource(R.plurals.tasks_why_supports_goals, count, count)
    val target = reason.numbers["nearestTargetInDays"]?.toInt() ?: return goals
    return stringResource(R.string.tasks_why_supports_goals_target, goals, inDays(target))
}

@Composable
private fun effort(
    minutes: Int,
    days: Int,
): String =
    stringResource(
        R.string.tasks_why_effort,
        pluralStringResource(R.plurals.tasks_why_minutes, minutes, minutes),
        pluralStringResource(R.plurals.tasks_why_days, days, days),
    )

@Composable
private fun inDays(days: Int): String =
    when {
        days == 0 -> stringResource(R.string.tasks_why_today)
        days == 1 -> stringResource(R.string.tasks_why_tomorrow)
        days < 0 -> pluralStringResource(R.plurals.tasks_why_days_ago, -days, -days)
        else -> pluralStringResource(R.plurals.tasks_why_in_days, days, days)
    }

/** The two reasons that lifted the task most. A blocked task leads with what it waits on, since that is why it sits low. */
@Composable
internal fun whyText(item: RankedTask): String {
    val top =
        item.components
            .filter { it.applicable && (it.contribution ?: 0.0) > 0 }
            .sortedByDescending { it.contribution ?: 0.0 }
            .take(2)
            .mapNotNull { reasonText(it.reason) }
    val parts = listOfNotNull(item.blockedReason?.let { reasonText(it) }) + top
    return if (parts.isEmpty()) stringResource(R.string.tasks_why_none) else parts.joinToString(" · ")
}

/** Every component in published order. */
@Composable
internal fun breakdown(item: RankedTask): List<BreakdownRow> {
    val doesNotApply = stringResource(R.string.tasks_why_does_not_apply)
    return item.components.map { component ->
        val text = reasonText(component.reason) ?: if (component.applicable) "" else doesNotApply
        BreakdownRow(componentLabel(component.name), text, component.contribution.takeIf { component.applicable })
    }
}

@Composable
internal fun componentLabel(name: String): String =
    when (name) {
        "user_priority" -> stringResource(R.string.tasks_component_user_priority)
        "due_proximity" -> stringResource(R.string.tasks_component_due_proximity)
        "goal_alignment" -> stringResource(R.string.tasks_component_goal_alignment)
        "blocking_impact" -> stringResource(R.string.tasks_component_blocking_impact)
        "effort_vs_time_left" -> stringResource(R.string.tasks_component_effort)
        "postponement_history" -> stringResource(R.string.tasks_component_postponed)
        else -> name
    }
