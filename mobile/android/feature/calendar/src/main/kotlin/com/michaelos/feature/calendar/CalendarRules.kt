package com.michaelos.feature.calendar

import com.michaelos.core.model.AppError
import com.michaelos.core.model.CalendarEvent
import com.michaelos.core.model.CalendarEventCreate
import com.michaelos.core.model.CalendarEventType
import com.michaelos.core.model.CalendarEventUpdate
import com.michaelos.core.model.PlanApply
import com.michaelos.core.model.PlanRequest
import com.michaelos.core.model.PlanningProposal
import com.michaelos.core.model.ProposedSession
import com.michaelos.core.model.TaskLink
import com.michaelos.core.model.UnscheduledTask
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/**
 * Wall-clock dates and times in the profile's zone, and the instants they name. Calendar works in instants; every
 * date and time it shows or takes is on this clock, never the device's.
 */
data class ZonedClock(
    val zone: String,
) {
    val zoneId: ZoneId = runCatching { ZoneId.of(zone) }.getOrDefault(ZoneId.systemDefault())

    /** In a daylight-saving gap the clock moves forward, as the server's does. */
    fun instant(
        date: LocalDate,
        time: LocalTime = LocalTime.MIDNIGHT,
    ): Instant = date.atTime(time).atZone(zoneId).toInstant()

    fun date(instant: Instant): LocalDate = instant.atZone(zoneId).toLocalDate()

    fun time(instant: Instant): LocalTime = instant.atZone(zoneId).toLocalTime().truncatedTo(ChronoUnit.MINUTES)

    fun minuteOfDay(instant: Instant): Int = time(instant).let { it.hour * MINUTES_PER_HOUR + it.minute }

    fun today(now: Instant = Instant.now()): LocalDate = date(now)
}

/** Monday to Sunday around one date: what the screen loads in one call and the week strip shows. */
data class CalendarWeek(
    val monday: LocalDate,
) {
    val days: List<LocalDate> get() = (0L until DAYS_PER_WEEK).map { monday.plusDays(it) }

    fun range(clock: ZonedClock): Pair<Instant, Instant> = clock.instant(monday) to clock.instant(monday.plusDays(DAYS_PER_WEEK))

    companion object {
        fun containing(date: LocalDate): CalendarWeek = CalendarWeek(date.minusDays(date.dayOfWeek.value - 1L))
    }
}

interface Timed {
    val startAt: Instant
    val endAt: Instant
}

/** Where one item sits in a day's grid, in wall-clock minutes (0 is midnight, 1,440 the next midnight). */
data class PlacedItem<T>(
    val item: T,
    val startMinute: Int,
    val endMinute: Int,
    val continuesBefore: Boolean,
    val continuesAfter: Boolean,
    val column: Int = 0,
    val columns: Int = 1,
)

/**
 * The web's `layoutDayEvents` (`src/lib/calendar-day-layout.ts`). An item that began the day before starts at 0, one
 * that runs into the next day ends at 1,440, none is drawn shorter than 30 minutes, and items that overlap share the
 * width, each in the first free column of its group.
 */
object DayLayout {
    const val MINUTES_PER_DAY = 1440
    const val SHORTEST_DRAWN = 30

    fun <T : Timed> place(
        items: List<T>,
        day: LocalDate,
        clock: ZonedClock,
    ): List<PlacedItem<T>> {
        val dayStart = clock.instant(day)
        val dayEnd = clock.instant(day.plusDays(1))
        val placed =
            items
                .filter { it.startAt < dayEnd && it.endAt > dayStart }
                .map { item ->
                    val before = item.startAt < dayStart
                    val after = item.endAt > dayEnd
                    val start = if (before) 0 else clock.minuteOfDay(item.startAt)
                    var end = if (after || item.endAt == dayEnd) MINUTES_PER_DAY else clock.minuteOfDay(item.endAt)
                    if (end <= start) end = MINUTES_PER_DAY
                    end = minOf(MINUTES_PER_DAY, maxOf(end, start + SHORTEST_DRAWN))
                    PlacedItem(item, start, end, before, after)
                }.sortedWith(compareBy<PlacedItem<T>> { it.startMinute }.thenByDescending { it.endMinute })
                .toMutableList()

        val group = mutableListOf<Int>()
        var groupEnd = -1

        fun close() {
            val columns = maxOf(1, group.maxOfOrNull { placed[it].column + 1 } ?: 1)
            group.forEach { placed[it] = placed[it].copy(columns = columns) }
            group.clear()
        }
        placed.indices.forEach { index ->
            if (placed[index].startMinute >= groupEnd) {
                close()
                groupEnd = -1
            }
            val busy = group.filter { placed[it].endMinute > placed[index].startMinute }.map { placed[it].column }.toSet()
            var column = 0
            while (column in busy) column++
            placed[index] = placed[index].copy(column = column)
            group += index
            groupEnd = maxOf(groupEnd, placed[index].endMinute)
        }
        close()
        return placed
    }

    /** An hour before the first item, never later than 8 AM. */
    fun firstMinute(starts: List<Int>): Int = maxOf(0, minOf(EIGHT_AM, starts.minOrNull() ?: EIGHT_AM) - MINUTES_PER_HOUR)

    private const val EIGHT_AM = 8 * 60
}

enum class EventKind(
    val type: CalendarEventType,
) {
    Commitment(CalendarEventType.Commitment),
    Unavailable(CalendarEventType.Unavailable),
    Session(CalendarEventType.TaskSession),
    ;

    companion object {
        fun of(type: CalendarEventType): EventKind =
            when (type) {
                CalendarEventType.TaskSession -> Session
                CalendarEventType.Unavailable -> Unavailable
                CalendarEventType.Commitment, CalendarEventType.Unknown -> Commitment
            }
    }
}

/** The event editor's fields. An end earlier than the start means the next day; an end equal to it is refused. */
data class EventForm(
    val title: String = "",
    val notes: String = "",
    val kind: EventKind = EventKind.Commitment,
    val date: LocalDate,
    val start: LocalTime,
    val end: LocalTime,
    val taskId: String? = null,
    val taskTitle: String? = null,
    /**
     * Days from the start's date to the end's. Set from the times as they change; an event from the web that spans
     * more days keeps its span until a time is changed.
     */
    val endDays: Int = if (end < start) 1 else 0,
) {
    enum class Problem { TitleMissing, NoLength }

    val endsNextDay: Boolean get() = endDays > 0

    fun withStart(time: LocalTime): EventForm = copy(start = time, endDays = if (end < time) 1 else 0)

    fun withEnd(time: LocalTime): EventForm = copy(end = time, endDays = if (time < start) 1 else 0)

    val problems: List<Problem>
        get() =
            buildList {
                if (title.isBlank()) add(Problem.TitleMissing)
                if (endDays == 0 && end == start) add(Problem.NoLength)
            }

    fun interval(clock: ZonedClock): Pair<Instant, Instant> =
        clock.instant(date, start) to clock.instant(date.plusDays(endDays.toLong()), end)

    private val trimmedNotes: String? get() = notes.trim().ifEmpty { null }

    fun create(clock: ZonedClock): CalendarEventCreate? {
        if (problems.isNotEmpty()) return null
        val (startAt, endAt) = interval(clock)
        return CalendarEventCreate(
            title = title.trim(),
            eventType = kind.type,
            startAt = startAt,
            endAt = endAt,
            timeZone = clock.zone,
            description = trimmedNotes,
            taskId = taskId.takeIf { kind == EventKind.Session },
        )
    }

    fun update(clock: ZonedClock): CalendarEventUpdate? {
        if (problems.isNotEmpty()) return null
        val (startAt, endAt) = interval(clock)
        return CalendarEventUpdate(
            title = title.trim(),
            description = trimmedNotes,
            startAt = startAt,
            endAt = endAt,
            timeZone = clock.zone,
            taskId = TaskLink(taskId).takeIf { kind == EventKind.Session },
        )
    }

    companion object {
        const val TITLE_LIMIT = 160
        const val NOTES_LIMIT = 5000

        /** A new event on [date]: the next whole hour today, otherwise 09:00, for [minutes]. */
        fun new(
            date: LocalDate,
            clock: ZonedClock,
            now: Instant = Instant.now(),
            minutes: Int = MINUTES_PER_HOUR,
        ): EventForm {
            val first =
                if (date == clock.today(now)) LocalTime.of(minOf(clock.time(now).hour + 1, LAST_HOUR), 0) else LocalTime.of(NINE, 0)
            val end = first.plusMinutes(minutes.toLong())
            return EventForm(date = date, start = first, end = end, endDays = if (end <= first) 1 else 0)
        }

        /** A focus session for one task, as long as its estimate. */
        fun scheduling(
            task: UnscheduledTask,
            date: LocalDate,
            clock: ZonedClock,
            now: Instant = Instant.now(),
        ): EventForm =
            new(date, clock, now, task.estimatedDurationMinutes ?: MINUTES_PER_HOUR).copy(
                title = task.title.take(TITLE_LIMIT),
                kind = EventKind.Session,
                taskId = task.id,
                taskTitle = task.title,
            )

        fun of(
            event: CalendarEvent,
            clock: ZonedClock,
        ): EventForm {
            val date = clock.date(event.startAt)
            return EventForm(
                title = event.title,
                notes = event.description.orEmpty(),
                kind = EventKind.of(event.eventType),
                date = date,
                start = clock.time(event.startAt),
                end = clock.time(event.endAt),
                taskId = event.taskId,
                taskTitle = event.taskTitle,
                endDays = ChronoUnit.DAYS.between(date, clock.date(event.endAt)).toInt(),
            )
        }

        private const val NINE = 9
        private const val LAST_HOUR = 23
    }
}

/** The dates a plan covers: from today or later, up to seven dates. */
data class PlanRange(
    val first: LocalDate,
    val last: LocalDate = first.plusDays(2),
) {
    val latestLast: LocalDate get() = first.plusDays(LONGEST - 1L)

    fun isValid(today: LocalDate): Boolean = first >= today && last >= first && last <= latestLast

    fun withFirst(date: LocalDate): PlanRange {
        val moved = copy(first = date)
        return if (moved.last < date || moved.last > moved.latestLast) moved.copy(last = date.plusDays(2)) else moved
    }

    val request: PlanRequest get() = PlanRequest(first, last)

    companion object {
        const val LONGEST = 7
    }
}

/** A proposal under review and the sessions the user keeps, all of them to start. Held in memory only, with its token. */
data class PlanReview(
    val proposal: PlanningProposal,
    val kept: Set<String> = proposal.proposedActivities.map { it.selectionId }.toSet(),
) {
    val sessions: List<ProposedSession> get() = proposal.proposedActivities.sortedBy { it.startAt }

    val keptCount: Int get() = kept.size

    fun isKept(session: ProposedSession): Boolean = session.selectionId in kept

    fun toggle(session: ProposedSession): PlanReview =
        copy(kept = if (session.selectionId in kept) kept - session.selectionId else kept + session.selectionId)

    fun title(taskId: String): String? = proposal.taskDetails.firstOrNull { it.id == taskId }?.title

    fun isExpired(now: Instant = Instant.now()): Boolean = now >= proposal.approvalExpiresAt

    /** Each task the planner could not place, with its title when it has one. */
    val notPlaced: List<Pair<String?, String>> get() = proposal.unscheduledTasks.map { title(it.taskId) to it.reason }

    val needsAvailability: Boolean get() = proposal.warnings.any { it.code == NO_AVAILABILITY }

    /** The planner's other notes, as it wrote them. */
    val notes: List<String> get() = proposal.warnings.filter { it.code != NO_AVAILABILITY }.map { it.message }

    val apply: PlanApply?
        get() = if (kept.isEmpty()) null else PlanApply(proposal.approvalToken, sessions.map { it.selectionId }.filter { it in kept })

    // Leaves the token out, so no log line can carry it.
    override fun toString(): String = "PlanReview($keptCount of ${proposal.proposedActivities.size})"

    private companion object {
        const val NO_AVAILABILITY = "AVAILABILITY_UNCONFIGURED"
    }
}

/** What a failed plan request or apply means for the user. */
sealed interface PlanProblem {
    /** The proposal no longer matches the calendar, tasks, availability or zone; nothing was applied. */
    data class Stale(
        val text: String?,
    ) : PlanProblem

    /** The planner refused the request as asked, such as no fit or a range it does not take. */
    data class Refused(
        val text: String?,
    ) : PlanProblem

    /** The planner or the network is down; trying again may work. */
    data class Unavailable(
        val error: AppError,
    ) : PlanProblem

    companion object {
        fun of(error: AppError): PlanProblem {
            val server =
                when (error) {
                    is AppError.Conflict -> error.server
                    is AppError.Validation -> error.server
                    is AppError.NotFound -> error.server
                    else -> return Unavailable(error)
                }
            return if (server.code in STALE_CODES) Stale(server.text) else Refused(server.text)
        }

        private val STALE_CODES =
            setOf(
                "PROPOSAL_EXPIRED",
                "PROPOSAL_USED",
                "CALENDAR_CHANGED",
                "STALE_TASKS",
                "AVAILABILITY_CHANGED",
                "TIMEZONE_CHANGED",
                "INVALID_SELECTION",
                "INVALID_PROPOSAL",
            )
    }
}

internal const val MINUTES_PER_HOUR = 60
private const val DAYS_PER_WEEK = 7L
