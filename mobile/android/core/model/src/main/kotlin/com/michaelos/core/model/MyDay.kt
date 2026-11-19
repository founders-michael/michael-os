@file:UseSerializers(InstantSerializer::class, LocalDateSerializer::class)

package com.michaelos.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.UseSerializers
import java.time.Instant
import java.time.LocalDate

/**
 * `GET /api/my-day`. Each nullable section is null when the server could not load that part; the rest still
 * arrives. Greeting, briefing and notices are computed on the server by the web screen's rules.
 */
@Serializable
data class MyDay(
    val today: LocalDate,
    val selectedDate: LocalDate,
    val timeZone: String,
    val greeting: String,
    val greetingName: String,
    val briefing: String? = null,
    val notices: List<MyDayNotice>,
    val tasks: MyDayTasks? = null,
    val timeline: List<TimelineItem>? = null,
    /** Null exactly when [timeline] is: both come from the task read, which may fail on its own. */
    val timelineTruncated: Boolean? = null,
    val habits: MyDayHabits? = null,
)

@Serializable
data class MyDayNotice(
    val id: String,
    val tone: Tone,
    val tag: String,
    val text: String,
    val actionLabel: String,
    /** The question to prefill in the Michael tab. Tapping the action never sends it. */
    val prompt: String? = null,
) {
    @Serializable(with = ToneSerializer::class)
    enum class Tone(
        override val wire: String,
    ) : OpenEnum {
        Warn("warn"),
        Ai("ai"),
        Unknown("unknown"),
    }
}

internal object ToneSerializer : OpenEnumSerializer<MyDayNotice.Tone>(
    "MyDayNotice.Tone",
    MyDayNotice.Tone.entries,
    MyDayNotice.Tone.Unknown,
)

@Serializable
data class MyDayTasks(
    val summary: TaskSummary,
    val dailySummary: DailyTaskSummary,
    val dailyTasks: List<DailyTask>,
    val sections: TaskSections,
)

@Serializable
data class TaskSummary(
    val dueToday: Int,
    val outstanding: Int,
    val completed: Int,
    val overdue: Int,
    val today: LocalDate,
)

/** Distinct tasks of the selected date, counted by their status on that date. */
@Serializable
data class DailyTaskSummary(
    val total: Int,
    val completed: Int,
    val inProgress: Int,
    val pending: Int,
    /** Tasks whose status on a past date cannot be reconstructed. */
    val unclassified: Int,
    val completionPercent: Int,
)

@Serializable
data class DailyTask(
    val task: Task,
    /** Null on a past date whose status history is unavailable. */
    val statusAtSelectedDate: TaskStatus? = null,
    val completionAtSelectedDate: Instant? = null,
    val activityAtSelectedDate: Instant? = null,
    val plannedSessions: List<PlannedSession>,
)

@Serializable
data class PlannedSession(
    val id: String,
    val startAt: Instant,
    val endAt: Instant,
    val timeZone: String,
)

@Serializable
data class TaskSections(
    val today: List<SectionTask>,
    val overdue: List<SectionTask>,
    val upcoming: List<SectionTask>,
    val backlog: List<SectionTask>,
    val completed: List<SectionTask>,
)

@Serializable
data class SectionTask(
    val task: Task,
    val sessions: List<PlannedSession>,
)

@Serializable
data class TimelineItem(
    val id: String,
    val kind: Kind,
    /** The server's name for the kind, such as "Focus session". */
    val label: String,
    val title: String,
    val description: String? = null,
    val startAt: Instant,
    val endAt: Instant,
    val timeZone: String,
    val taskId: String? = null,
    val taskTitle: String? = null,
) {
    @Serializable(with = KindSerializer::class)
    enum class Kind(
        override val wire: String,
    ) : OpenEnum {
        Focus("focus"),
        Commitment("commitment"),
        Unavailable("unavailable"),
        Unknown("unknown"),
    }
}

internal object KindSerializer : OpenEnumSerializer<TimelineItem.Kind>(
    "TimelineItem.Kind",
    TimelineItem.Kind.entries,
    TimelineItem.Kind.Unknown,
)

/** Today's scheduled habits, at most four. Always for the server's today, whatever date was asked for. */
@Serializable
data class MyDayHabits(
    val today: LocalDate,
    val summary: HabitSummary,
    val habits: List<Habit>,
)

@Serializable
data class HabitSummary(
    val active: Int,
    val scheduledToday: Int,
    val completedToday: Int,
)
