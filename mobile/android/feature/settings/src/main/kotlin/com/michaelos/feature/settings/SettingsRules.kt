package com.michaelos.feature.settings

import com.michaelos.core.model.Account
import com.michaelos.core.model.AccountUpdate
import com.michaelos.core.model.Availability
import com.michaelos.core.model.AvailabilityUpdate
import com.michaelos.core.model.AvailabilityWindow
import com.michaelos.core.model.DayOfWeek
import com.michaelos.core.model.PersonalContext
import com.michaelos.core.model.PersonalContextSave
import com.michaelos.core.model.PlanningStyle
import com.michaelos.core.model.Profile
import com.michaelos.core.model.RoutineUpdate
import java.time.LocalTime
import java.util.UUID

/** The two names the user may change. Rules mirror `account-validation.ts`; the server checks them again. */
data class AccountForm(
    val fullName: String,
    val preferredName: String,
) {
    enum class Problem { Missing, TooLong }

    val save: AccountUpdate?
        get() =
            if (problem(fullName) == null && problem(preferredName) == null) {
                AccountUpdate(normalized(fullName), normalized(preferredName))
            } else {
                null
            }

    companion object {
        const val NAME_LIMIT = 80

        fun of(account: Account) = AccountForm(account.fullName, account.preferredName)

        /** Runs of spaces become one and the ends are trimmed, as the server stores it. */
        fun normalized(name: String): String =
            name
                .trim()
                .split(Regex("\\s+"))
                .filter { it.isNotEmpty() }
                .joinToString(" ")

        fun problem(name: String): Problem? {
            val normalized = normalized(name)
            return when {
                normalized.isEmpty() -> Problem.Missing
                normalized.length > NAME_LIMIT -> Problem.TooLong
                else -> null
            }
        }
    }
}

/** My Context as the editor holds it, with the version it was loaded at. */
data class ContextDraft(
    val text: String,
    val version: String?,
) {
    val count: Int get() = normalized(text).length
    val isTooLong: Boolean get() = count > LIMIT

    fun save(over: String?) = PersonalContextSave(normalized(text), over)

    companion object {
        const val LIMIT = 5000

        fun of(context: PersonalContext) = ContextDraft(context.summary, context.updatedAt)

        /** What the server stores and counts: Windows line endings become `\n`, trailing space is dropped. */
        fun normalized(text: String): String = text.replace("\r\n", "\n").replace("\r", "\n").trimEnd()
    }
}

/** Deleting the account asks for the password and for this word typed exactly. */
object DeleteConfirmation {
    const val WORD = "DELETE"

    fun isReady(
        password: String,
        typed: String,
    ): Boolean = password.isNotEmpty() && typed == WORD
}

/** The routine as Settings edits it. Rules mirror `profile-validation.ts`; the server checks them again. */
data class RoutineForm(
    val timeZone: String,
    val wakeUpTime: LocalTime,
    val bedtime: LocalTime,
    val hasWorkHours: Boolean,
    val workStartTime: LocalTime,
    val workEndTime: LocalTime,
    val workDays: List<DayOfWeek>,
    val priorities: List<String>,
    val focusSessionMinutes: Int,
    val breakDurationMinutes: Int,
    val planningStyle: PlanningStyle,
) {
    enum class PriorityProblem { Empty, TooLong, Duplicate, Full }

    /** Work hours end after they start; overnight work hours are not supported by the server. */
    val workHoursProblem: Boolean get() = hasWorkHours && workStartTime >= workEndTime

    fun toggle(day: DayOfWeek): RoutineForm =
        copy(workDays = if (day in workDays) workDays - day else WEEK.filter { it in workDays || it == day })

    /** The form with [text] added, or why it was not. */
    fun addPriority(text: String): Pair<RoutineForm, PriorityProblem?> {
        val problem = problem(text, priorities)
        return if (problem == null) copy(priorities = priorities + text.trim()) to null else this to problem
    }

    val save: RoutineUpdate?
        get() =
            if (workHoursProblem) {
                null
            } else {
                RoutineUpdate(
                    timeZone = timeZone,
                    wakeUpTime = wakeUpTime,
                    bedtime = bedtime,
                    workStartTime = workStartTime.takeIf { hasWorkHours },
                    workEndTime = workEndTime.takeIf { hasWorkHours },
                    workDays = workDays,
                    priorities = priorities,
                    focusSessionMinutes = focusSessionMinutes,
                    breakDurationMinutes = breakDurationMinutes,
                    planningStyle = planningStyle,
                )
            }

    companion object {
        const val PRIORITY_LIMIT = 3
        const val PRIORITY_LENGTH = 100
        const val MINUTE_STEP = 5
        val FOCUS_RANGE = 15..180
        val BREAK_RANGE = 0..60
        val WEEK = DayOfWeek.entries - DayOfWeek.Unknown

        // Offered when work hours are switched on; nothing is stored until the user saves.
        private val DEFAULT_WORK_START: LocalTime = LocalTime.of(9, 0)
        private val DEFAULT_WORK_END: LocalTime = LocalTime.of(18, 0)

        fun of(profile: Profile) =
            RoutineForm(
                timeZone = profile.timeZone,
                wakeUpTime = profile.wakeUpTime,
                bedtime = profile.bedtime,
                hasWorkHours = profile.workStartTime != null && profile.workEndTime != null,
                workStartTime = profile.workStartTime ?: DEFAULT_WORK_START,
                workEndTime = profile.workEndTime ?: DEFAULT_WORK_END,
                workDays = WEEK.filter { it in profile.workDays },
                priorities = profile.priorities,
                focusSessionMinutes = profile.focusSessionMinutes,
                breakDurationMinutes = profile.breakDurationMinutes,
                planningStyle = if (profile.planningStyle == PlanningStyle.Unknown) PlanningStyle.Balanced else profile.planningStyle,
            )

        fun problem(
            text: String,
            priorities: List<String>,
        ): PriorityProblem? {
            val priority = text.trim()
            return when {
                priority.isEmpty() -> PriorityProblem.Empty
                priority.length > PRIORITY_LENGTH -> PriorityProblem.TooLong
                priorities.any { it.equals(priority, ignoreCase = true) } -> PriorityProblem.Duplicate
                priorities.size >= PRIORITY_LIMIT -> PriorityProblem.Full
                else -> null
            }
        }
    }
}

/** The weekly availability being edited, checked as the server checks it before it is sent. */
data class AvailabilityPlan(
    val timeZone: String,
    val slots: List<Slot>,
) {
    data class Slot(
        val id: String,
        val window: AvailabilityWindow,
    )

    enum class Problem {
        /** The end is not after the start: the window is empty or would cross midnight. */
        Order,

        /** It overlaps another window on the same weekday. Touching ends are allowed. */
        Overlap,
    }

    val windows: List<AvailabilityWindow> get() = slots.map { it.window }
    val canAdd: Boolean get() = slots.size < LIMIT

    fun slots(weekday: Int): List<Slot> = slots.filter { it.window.weekday == weekday }.sortedBy { it.window.startTime }

    fun problem(id: String): Problem? {
        val window = slots.firstOrNull { it.id == id }?.window ?: return null
        if (window.startTime >= window.endTime) return Problem.Order
        val overlaps =
            slots.any { other ->
                val w = other.window
                other.id != id &&
                    w.weekday == window.weekday &&
                    w.timeZone == window.timeZone &&
                    w.startTime < w.endTime &&
                    window.startTime < w.endTime &&
                    window.endTime > w.startTime
            }
        return if (overlaps) Problem.Overlap else null
    }

    fun problems(weekday: Int): Set<Problem> = slots(weekday).mapNotNull { problem(it.id) }.toSet()

    val save: AvailabilityUpdate? get() = if (slots.all { problem(it.id) == null }) AvailabilityUpdate(windows) else null

    /** A new window starts where the day's last one ends, or 09:00 to 17:00 on an empty day. */
    fun add(weekday: Int): Pair<AvailabilityPlan, String?> {
        if (!canAdd) return this to null
        val last = slots(weekday).lastOrNull()?.window?.endTime
        val start = last ?: LocalTime.of(DEFAULT_START_HOUR, 0)
        val end =
            when {
                last == null -> LocalTime.of(DEFAULT_END_HOUR, 0)
                last.toSecondOfDay() + NEXT_LENGTH_MINUTES * SECONDS_PER_MINUTE > LAST_MINUTE.toSecondOfDay() -> LAST_MINUTE
                else -> last.plusMinutes(NEXT_LENGTH_MINUTES.toLong())
            }
        val slot =
            Slot(UUID.randomUUID().toString(), AvailabilityWindow(weekday = weekday, startTime = start, endTime = end, timeZone = timeZone))
        return copy(slots = slots + slot) to slot.id
    }

    fun update(
        id: String,
        change: (AvailabilityWindow) -> AvailabilityWindow,
    ): AvailabilityPlan = copy(slots = slots.map { if (it.id == id) it.copy(window = change(it.window)) else it })

    fun remove(id: String): AvailabilityPlan = copy(slots = slots.filterNot { it.id == id })

    companion object {
        const val LIMIT = 50
        private const val DEFAULT_START_HOUR = 9
        private const val DEFAULT_END_HOUR = 17
        private const val NEXT_LENGTH_MINUTES = 120
        private const val SECONDS_PER_MINUTE = 60
        private val LAST_MINUTE: LocalTime = LocalTime.of(23, 59)

        fun of(availability: Availability) =
            AvailabilityPlan(availability.timeZone, availability.windows.map { Slot(UUID.randomUUID().toString(), it) })
    }
}

/** What the server accepts as a picture, decided by the bytes as `profile-image.ts` does. */
object PictureRules {
    const val MAX_BYTES = 2 * 1024 * 1024

    /** Photos are re-encoded to this size before upload, which also drops their location and camera details. */
    const val LONGEST_SIDE = 1024

    private val PNG = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
    private val JPEG = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte())
    private val RIFF = byteArrayOf(0x52, 0x49, 0x46, 0x46)
    private val WEBP = byteArrayOf(0x57, 0x45, 0x42, 0x50)
    private const val WEBP_OFFSET = 8

    fun contentType(data: ByteArray): String? =
        when {
            data.startsWith(PNG) -> "image/png"
            data.startsWith(JPEG) -> "image/jpeg"
            data.startsWith(RIFF) && data.startsWith(WEBP, WEBP_OFFSET) -> "image/webp"
            else -> null
        }

    fun isAccepted(data: ByteArray): Boolean = data.isNotEmpty() && data.size <= MAX_BYTES && contentType(data) != null

    private fun ByteArray.startsWith(
        prefix: ByteArray,
        offset: Int = 0,
    ): Boolean = size >= offset + prefix.size && prefix.indices.all { this[offset + it] == prefix[it] }
}
