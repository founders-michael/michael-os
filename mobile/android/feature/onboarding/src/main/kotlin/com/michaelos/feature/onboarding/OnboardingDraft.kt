package com.michaelos.feature.onboarding

import com.michaelos.core.model.DayOfWeek
import com.michaelos.core.model.PlanningStyle
import com.michaelos.core.model.Profile
import com.michaelos.core.model.ProfileUpdate
import java.time.Duration
import java.time.LocalTime

/** The answers so far. Every save sends all of them, since the server validates the whole profile each time. */
data class OnboardingDraft(
    val preferredName: String,
    val timeZone: String,
    val wakeUpTime: LocalTime,
    val bedtime: LocalTime,
    val workStartTime: LocalTime?,
    val workEndTime: LocalTime?,
    val workDays: List<DayOfWeek>,
    val priorities: List<String>,
    val focusSessionMinutes: Int,
    val breakDurationMinutes: Int,
    val planningStyle: PlanningStyle,
) {
    fun update(onboardingStep: Int) =
        ProfileUpdate(
            preferredName = preferredName.trim(),
            timeZone = timeZone,
            wakeUpTime = wakeUpTime,
            bedtime = bedtime,
            workStartTime = workStartTime,
            workEndTime = workEndTime,
            workDays = WEEK.filter { it in workDays },
            priorities = priorities,
            focusSessionMinutes = focusSessionMinutes,
            breakDurationMinutes = breakDurationMinutes,
            planningStyle = planningStyle,
            onboardingStep = onboardingStep,
        )

    /** Minutes awake between wake-up and bedtime. A bedtime before the wake-up time is after midnight. */
    val awakeMinutes: Int
        get() {
            val minutes = Duration.between(wakeUpTime, bedtime).toMinutes().toInt()
            return if (minutes > 0) minutes else minutes + MINUTES_PER_DAY
        }

    companion object {
        const val NAME_LIMIT = 80
        const val PRIORITY_LIMIT = 3
        const val PRIORITY_LENGTH = 100
        val FOCUS_RANGE = 15..180
        val BREAK_RANGE = 0..60
        const val MINUTE_STEP = 5
        val SUGGESTED_PRIORITIES = listOf("Health", "Family", "Career", "Learning", "Money", "Friends")

        // Shown when the work hours are first offered; the server stores none until the user continues.
        val DEFAULT_WORK_START: LocalTime = LocalTime.of(9, 0)
        val DEFAULT_WORK_END: LocalTime = LocalTime.of(18, 0)
        val WEEK =
            listOf(
                DayOfWeek.Monday,
                DayOfWeek.Tuesday,
                DayOfWeek.Wednesday,
                DayOfWeek.Thursday,
                DayOfWeek.Friday,
                DayOfWeek.Saturday,
                DayOfWeek.Sunday,
            )
        private const val MINUTES_PER_DAY = 24 * 60
        private val DEFAULT_WAKE_UP: LocalTime = LocalTime.of(7, 0)
        private val DEFAULT_BEDTIME: LocalTime = LocalTime.of(22, 30)
        private const val WORKING_DAYS = 5
        private const val DEFAULT_FOCUS_MINUTES = 50
        private const val DEFAULT_BREAK_MINUTES = 10

        /** The web app's defaults for a new profile (`defaultProfileFormData`), with the phone's time zone. */
        fun initial(
            name: String,
            timeZone: String,
        ) = OnboardingDraft(
            preferredName = name,
            timeZone = timeZone,
            wakeUpTime = DEFAULT_WAKE_UP,
            bedtime = DEFAULT_BEDTIME,
            workStartTime = null,
            workEndTime = null,
            workDays = WEEK.take(WORKING_DAYS),
            priorities = emptyList(),
            focusSessionMinutes = DEFAULT_FOCUS_MINUTES,
            breakDurationMinutes = DEFAULT_BREAK_MINUTES,
            planningStyle = PlanningStyle.Balanced,
        )

        fun of(profile: Profile) =
            OnboardingDraft(
                preferredName = profile.preferredName,
                timeZone = profile.timeZone,
                wakeUpTime = profile.wakeUpTime,
                bedtime = profile.bedtime,
                workStartTime = profile.workStartTime,
                workEndTime = profile.workEndTime,
                workDays = profile.workDays.filter { it != DayOfWeek.Unknown },
                priorities = profile.priorities,
                focusSessionMinutes = profile.focusSessionMinutes,
                breakDurationMinutes = profile.breakDurationMinutes,
                planningStyle = if (profile.planningStyle == PlanningStyle.Unknown) PlanningStyle.Balanced else profile.planningStyle,
            )
    }
}
