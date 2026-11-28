package com.michaelos.feature.goals

import com.michaelos.core.model.Goal
import com.michaelos.core.model.GoalSave
import com.michaelos.core.model.GoalStatus
import com.michaelos.core.model.MilestoneStatus
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.math.abs
import kotlin.math.roundToInt

/** Progress and milestone completion are both out of this. */
internal const val PERCENT = 100

/** The goal editor's fields. Limits mirror `goal-validation.ts`; the server checks them again. */
data class GoalForm(
    val title: String = "",
    val notes: String = "",
    val category: String = "",
    val targetDate: LocalDate? = null,
    val progress: Int = 0,
    /** False for a completed goal: its progress is locked until it is reopened, and the server refuses a change. */
    val editsProgress: Boolean = true,
) {
    val titleMissing: Boolean get() = title.isBlank()

    /** The save, or null while the form cannot be saved. */
    val save: GoalSave?
        get() =
            if (titleMissing) {
                null
            } else {
                GoalSave(
                    title = title.trim(),
                    description = notes.trim().ifEmpty { null },
                    category = category.trim().ifEmpty { null },
                    targetDate = targetDate,
                    progress = if (editsProgress) progress else null,
                )
            }

    companion object {
        const val TITLE_LIMIT = 160
        const val NOTES_LIMIT = 5000
        const val CATEGORY_LIMIT = 80

        fun of(goal: Goal): GoalForm =
            GoalForm(
                title = goal.title,
                notes = goal.description.orEmpty(),
                category = goal.category.orEmpty(),
                targetDate = goal.targetDate,
                progress = goal.progress,
                editsProgress = goal.status != GoalStatus.Completed,
            )
    }
}

/**
 * Michael's read on one active goal, mirrored from the web's `goalCoachRead` (`src/lib/goal-coach.ts`): fixed rules
 * over the goal's saved fields, never a model call.
 */
data class GoalRead(
    val standing: Standing,
    val done: Int,
    val total: Int,
    val progress: Int,
    /** Null without milestones. */
    val milestonePercent: Int?,
    /** The first milestone not yet completed. */
    val nextMilestone: String?,
    val targetPassed: Boolean,
) {
    sealed interface Standing {
        data object NoMilestones : Standing

        /** Manual progress is this far from the milestone percentage; [ahead] when progress is the larger. */
        data class Drift(
            val ahead: Boolean,
        ) : Standing

        data object InStep : Standing
    }

    val progressDrift: Boolean get() = standing is Standing.Drift

    companion object {
        const val DRIFT_POINTS = 10

        fun of(
            goal: Goal,
            today: LocalDate,
        ): GoalRead {
            val total = goal.milestones.size
            val done = goal.milestones.count { it.status == MilestoneStatus.Completed }
            val percent = if (total == 0) null else (done * PERCENT.toDouble() / total).roundToInt()
            val standing =
                when {
                    percent == null -> Standing.NoMilestones
                    abs(goal.progress - percent) >= DRIFT_POINTS -> Standing.Drift(ahead = goal.progress > percent)
                    else -> Standing.InStep
                }
            return GoalRead(
                standing = standing,
                done = done,
                total = total,
                progress = goal.progress,
                milestonePercent = percent,
                nextMilestone = goal.milestones.firstOrNull { it.status != MilestoneStatus.Completed }?.title,
                targetPassed = goal.status == GoalStatus.Active && goal.targetDate?.isBefore(today) == true,
            )
        }
    }
}

/** When a goal is due, as the list and detail show it. */
sealed interface GoalTarget {
    data object None : GoalTarget

    data class Passed(
        val date: LocalDate,
    ) : GoalTarget

    data object Today : GoalTarget

    data class InDays(
        val days: Int,
    ) : GoalTarget

    data class OnDate(
        val date: LocalDate,
    ) : GoalTarget

    companion object {
        /** Days are counted only for an active goal; a finished one just shows its date. */
        const val COUNTED_DAYS = 14

        fun of(
            goal: Goal,
            today: LocalDate,
        ): GoalTarget {
            val target = goal.targetDate ?: return None
            if (goal.status != GoalStatus.Active) return OnDate(target)
            val days = ChronoUnit.DAYS.between(today, target).toInt()
            return when {
                days < 0 -> Passed(target)
                days == 0 -> Today
                days <= COUNTED_DAYS -> InDays(days)
                else -> OnDate(target)
            }
        }
    }
}
