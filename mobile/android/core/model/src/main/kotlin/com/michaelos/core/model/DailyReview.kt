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

/** `GET /api/lifestyle/daily-review`: one local date as the server reads it. Every count and status is the server's. */
@Serializable
data class DailyReview(
    val date: LocalDate,
    /** The profile's zone; clock times on this screen are shown in it. */
    val timeZone: String,
    val overview: ReviewOverview,
    val plannedTasks: List<ReviewTask>,
    val completedTasks: List<ReviewCompletion>,
    val missedTasks: List<ReviewTask>,
    val time: ReviewTime,
    /** Null until the first save for the date. */
    val reflection: StoredReflection? = null,
    val tomorrow: ReviewTomorrow,
    val weekly: ReviewWeek,
)

@Serializable
data class ReviewOverview(
    val planned: Int,
    val completed: Int,
    val inProgress: Int,
    val pending: Int,
    val overdue: Int,
    val completionPercent: Int,
    val cancelledSessions: Int,
)

/** A task as it stood on the review date. */
@Serializable
data class ReviewTask(
    val task: Task,
    /** Null when the history cannot say. */
    val statusAtSelectedDate: TaskStatus? = null,
    val dueDateAtSelectedDate: LocalDate? = null,
    val overdueAtSelectedDate: Boolean,
    /** Sent only on missed tasks. */
    val intentionallySkipped: Boolean = false,
)

@Serializable
data class ReviewCompletion(
    val task: Task,
    val completedAt: Instant,
)

/** Scheduled time only. Actual time is not tracked, so there is no actual figure to show. */
@Serializable
data class ReviewTime(
    /** Null when availability is not configured. */
    val plannedWorkingMinutes: Int? = null,
    val scheduledTaskMinutes: Int,
    val scheduledCalendarMinutes: Int,
)

@Serializable
data class ReviewTomorrow(
    val date: LocalDate,
    val incompleteTasks: List<Task>,
)

@Serializable
data class ReviewWeek(
    val days: List<Day>,
    val planned: Int,
    val completed: Int,
    val completionPercent: Int,
    val incomplete: Int,
    val rescheduled: Int,
    val consistencyDays: Int,
    val habits: Habits,
) {
    @Serializable
    data class Day(
        val date: LocalDate,
        val planned: Int,
        val completed: Int,
    )

    @Serializable
    data class Habits(
        val scheduled: Int,
        val completed: Int,
        val consistencyPercent: Int,
    )
}

/** The reflection as stored. It carries `updatedAt`, which a save must never send back. */
@Serializable
data class StoredReflection(
    val wentWell: String,
    val challenges: String,
    val blockers: String,
    val lessonsLearned: String,
    val improvements: String,
    val intentionallySkippedTaskIds: List<String>,
)

@Serializable
data class ReflectionResponse(
    val reflection: StoredReflection,
)

/** `PUT /api/lifestyle/daily-review`. Every field is required; built field by field, so no stored field leaks in. */
@Serializable
data class ReflectionSave(
    val date: LocalDate,
    val wentWell: String,
    val challenges: String,
    val blockers: String,
    val lessonsLearned: String,
    val improvements: String,
    val intentionallySkippedTaskIds: List<String>,
)

/** `POST /api/lifestyle/daily-review/carry-forward`: a date (with both times or neither), or unscheduled. */
@Serializable
data class CarryForward(
    val reviewDate: LocalDate,
    val taskId: String,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val targetDate: LocalDate? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val unschedule: Boolean? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val startTime: LocalTime? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val endTime: LocalTime? = null,
) {
    companion object {
        fun move(
            task: String,
            review: LocalDate,
            date: LocalDate,
            start: LocalTime?,
            end: LocalTime?,
        ) = CarryForward(review, task, targetDate = date, startTime = start, endTime = end)

        fun unschedule(
            task: String,
            review: LocalDate,
        ) = CarryForward(review, task, unschedule = true)
    }
}

@Serializable
data class CarryForwardResponse(
    val result: Result,
) {
    @Serializable
    data class Result(
        val taskId: String,
        /** Null when the task was left unscheduled. */
        val targetDate: LocalDate? = null,
    )
}
