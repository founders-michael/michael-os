package com.michaelos.feature.onboarding

/**
 * The five steps on the phone. The server's `onboardingStep` counts the web app's steps (0 welcome, 1 about you,
 * 2 routine, 3 priorities, 4 preferences, 5 review) and means "resume here", so a user can start on one and finish
 * on the other. The web's routine step holds both sleep and work hours.
 */
enum class OnboardingStep {
    Name,
    Sleep,
    Work,
    Priorities,
    Focus,
    ;

    val number: Int get() = ordinal + 1

    /** Saved with this step's answers: where to resume once they are stored. Completing needs 5 saved. */
    val serverStepAfter: Int
        get() =
            when (this) {
                Name, Sleep -> WEB_ROUTINE
                Work -> WEB_PRIORITIES
                Priorities -> WEB_PREFERENCES
                Focus -> WEB_REVIEW
            }

    val next: OnboardingStep? get() = entries.getOrNull(ordinal + 1)
    val previous: OnboardingStep? get() = entries.getOrNull(ordinal - 1)

    companion object {
        private const val WEB_ABOUT_YOU = 1
        private const val WEB_ROUTINE = 2
        private const val WEB_PRIORITIES = 3
        private const val WEB_PREFERENCES = 4
        private const val WEB_REVIEW = 5

        fun resumingAt(serverStep: Int): OnboardingStep =
            when {
                serverStep <= WEB_ABOUT_YOU -> Name
                serverStep == WEB_ROUTINE -> Sleep
                serverStep == WEB_PRIORITIES -> Priorities
                else -> Focus
            }

        /** The step that shows a field the server named in a 400. */
        fun showing(field: String): OnboardingStep? =
            when (field) {
                "preferredName", "timeZone" -> Name
                "wakeUpTime", "bedtime" -> Sleep
                "workStartTime", "workEndTime", "workDays" -> Work
                "priorities" -> Priorities
                "focusSessionMinutes", "breakDurationMinutes", "planningStyle" -> Focus
                else -> null
            }
    }
}
