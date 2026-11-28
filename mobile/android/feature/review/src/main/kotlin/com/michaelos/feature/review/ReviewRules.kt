package com.michaelos.feature.review

import com.michaelos.core.model.AppError
import com.michaelos.core.model.DailyReview
import com.michaelos.core.model.ReflectionSave
import com.michaelos.core.model.StoredReflection
import java.time.LocalDate
import java.time.LocalTime

/** The reflection as the screen edits it: five texts and the tasks marked intentionally skipped. */
data class ReflectionDraft(
    val texts: Map<Field, String> = emptyMap(),
    val skipped: List<String> = emptyList(),
) {
    enum class Field { WentWell, Challenges, Blockers, LessonsLearned, Improvements }

    operator fun get(field: Field): String = texts[field].orEmpty()

    fun with(
        field: Field,
        text: String,
    ): ReflectionDraft = copy(texts = texts + (field to text.take(TEXT_LIMIT)))

    fun isSkipped(task: String): Boolean = task in skipped

    fun toggleSkipped(task: String): ReflectionDraft = copy(skipped = if (task in skipped) skipped - task else skipped + task)

    /** Built field by field: nothing the server stored beside the reflection can reach the save. */
    fun save(date: LocalDate): ReflectionSave =
        ReflectionSave(
            date = date,
            wentWell = this[Field.WentWell],
            challenges = this[Field.Challenges],
            blockers = this[Field.Blockers],
            lessonsLearned = this[Field.LessonsLearned],
            improvements = this[Field.Improvements],
            intentionallySkippedTaskIds = skipped,
        )

    companion object {
        const val TEXT_LIMIT = 10_000

        fun of(stored: StoredReflection?): ReflectionDraft =
            if (stored == null) {
                ReflectionDraft()
            } else {
                ReflectionDraft(
                    mapOf(
                        Field.WentWell to stored.wentWell,
                        Field.Challenges to stored.challenges,
                        Field.Blockers to stored.blockers,
                        Field.LessonsLearned to stored.lessonsLearned,
                        Field.Improvements to stored.improvements,
                    ),
                    stored.intentionallySkippedTaskIds,
                )
            }
    }
}

/** Where the reflection stands against the server. */
sealed interface SaveState {
    data object Saved : SaveState

    data object Unsaved : SaveState

    data object Saving : SaveState

    /** The text stays on screen; the next edit tries again. */
    data class Failed(
        val error: AppError,
    ) : SaveState
}

/**
 * Moving a missed task to another day. Rules mirror `carryForwardReviewTaskSchema` and the service; the server checks
 * them again, along with availability and calendar conflicts.
 */
data class CarryForwardForm(
    val date: LocalDate,
    val startTime: LocalTime? = null,
    val endTime: LocalTime? = null,
) {
    enum class Problem { TooEarly, OneTime, EndNotAfterStart }

    fun problem(
        review: LocalDate,
        today: LocalDate,
    ): Problem? {
        val start = startTime
        val end = endTime
        return when {
            date < earliest(review, today) -> Problem.TooEarly
            (start == null) != (end == null) -> Problem.OneTime
            start != null && end != null && !end.isAfter(start) -> Problem.EndNotAfterStart
            else -> null
        }
    }

    companion object {
        /** The first day a task from this review may move to: after the review date, and not before today. */
        fun earliest(
            review: LocalDate,
            today: LocalDate,
        ): LocalDate = maxOf(review.plusDays(1), today)
    }
}

/** What happened to a missed task on this screen since the review was read. */
sealed interface Moved {
    data class Date(
        val date: LocalDate,
    ) : Moved

    data object Unscheduled : Moved
}

/** Michael's line on the review, mirrored from the web's `reviewLine` (`daily-review.tsx`). */
sealed interface ReviewLine {
    data object NothingPlanned : ReviewLine

    data class Completed(
        val done: Int,
        val planned: Int,
        val percent: Int,
        val open: Int,
    ) : ReviewLine

    companion object {
        fun of(review: DailyReview): ReviewLine =
            if (review.overview.planned == 0) {
                NothingPlanned
            } else {
                Completed(review.overview.completed, review.overview.planned, review.overview.completionPercent, review.missedTasks.size)
            }
    }
}
