package com.michaelos.feature.onboarding

import com.michaelos.core.model.AppError
import com.michaelos.core.model.DayOfWeek
import com.michaelos.core.model.ServerMessage
import com.michaelos.core.model.apiJson
import com.michaelos.core.testing.FakeProfileRepository
import com.michaelos.core.testing.MainDispatcherRule
import com.michaelos.core.testing.toProfile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.time.LocalTime

class OnboardingViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private fun model(profiles: FakeProfileRepository = FakeProfileRepository()) =
        OnboardingViewModel(
            "Sam Rivera",
            "Europe/Lisbon",
            profiles,
        )

    private fun saved(
        step: Int,
        completed: Boolean = false,
    ) = OnboardingDraft.initial("Sam", "Asia/Kolkata").update(step).toProfile(completed)

    private val OnboardingViewModel.state get() = uiState.value

    @Test
    fun newUserStartsAtTheFirstStepWithTheirNameAndThePhonesZone() {
        val onboarding = model()
        assertEquals(OnboardingStage.Step(OnboardingStep.Name), onboarding.state.stage)
        assertEquals("Sam Rivera", onboarding.state.draft.preferredName)
        assertEquals("Europe/Lisbon", onboarding.state.draft.timeZone)
        assertEquals(LocalTime.of(7, 0), onboarding.state.draft.wakeUpTime)
    }

    @Test
    fun resumesAtTheSavedStepWithTheSavedAnswers() {
        val cases =
            listOf(
                0 to OnboardingStep.Name,
                1 to OnboardingStep.Name,
                2 to OnboardingStep.Sleep,
                3 to OnboardingStep.Priorities,
                4 to OnboardingStep.Focus,
                5 to OnboardingStep.Focus,
            )
        for ((serverStep, expected) in cases) {
            val onboarding = model(FakeProfileRepository(saved(serverStep)))
            assertEquals("server step $serverStep", OnboardingStage.Step(expected), onboarding.state.stage)
            assertEquals("Asia/Kolkata", onboarding.state.draft.timeZone)
        }
    }

    @Test
    fun aCompletedProfileFinishesAtOnce() {
        assertEquals(OnboardingStage.Finished, model(FakeProfileRepository(saved(5, completed = true))).state.stage)
    }

    @Test
    fun loadFailureIsShownAndCanBeRetried() {
        val profiles = FakeProfileRepository()
        profiles.failNext(AppError.Offline)
        val onboarding = model(profiles)
        assertEquals(OnboardingStage.Failed(AppError.Offline), onboarding.state.stage)
        onboarding.load()
        assertEquals(OnboardingStage.Step(OnboardingStep.Name), onboarding.state.stage)
    }

    @Test
    fun eachStepSavesEveryAnswerAndWhereToResume() {
        val profiles = FakeProfileRepository()
        val onboarding = model(profiles)
        repeat(OnboardingStep.entries.size) { onboarding.advance() }
        assertEquals(listOf(2, 2, 3, 4, 5), profiles.saved.map { it.onboardingStep })
        assertEquals(1, profiles.completes)
        assertEquals(OnboardingStage.Finished, onboarding.state.stage)
        val last = profiles.saved.last()
        assertEquals(LocalTime.of(9, 0), last.workStartTime)
        assertEquals(LocalTime.of(18, 0), last.workEndTime)
        assertEquals(OnboardingDraft.WEEK.take(5), last.workDays)
    }

    @Test
    fun blankNameStaysOnTheStep() {
        val profiles = FakeProfileRepository()
        val onboarding = model(profiles)
        onboarding.edit { it.copy(preferredName = "   ") }
        onboarding.advance()
        assertEquals(OnboardingStage.Step(OnboardingStep.Name), onboarding.state.stage)
        assertEquals(FieldProblem.Local.NameRequired, onboarding.state.fieldProblems["preferredName"])
        assertTrue(profiles.saved.isEmpty())
        onboarding.edit { it.copy(preferredName = "Sam") }
        assertTrue(onboarding.state.fieldProblems.isEmpty())
    }

    @Test
    fun workHoursMustEndAfterTheyStart() {
        val onboarding = model(FakeProfileRepository(saved(2)))
        onboarding.advance()
        assertEquals(OnboardingStage.Step(OnboardingStep.Work), onboarding.state.stage)
        onboarding.edit { it.copy(workStartTime = LocalTime.of(18, 0), workEndTime = LocalTime.of(9, 0)) }
        onboarding.advance()
        assertEquals(OnboardingStage.Step(OnboardingStep.Work), onboarding.state.stage)
        assertEquals(FieldProblem.Local.EndBeforeStart, onboarding.state.fieldProblems["workEndTime"])
    }

    @Test
    fun noFixedHoursSendsNoDaysAndNullHours() {
        val profiles = FakeProfileRepository(saved(2))
        val onboarding = model(profiles)
        onboarding.advance()
        onboarding.skipWorkHours()
        assertEquals(OnboardingStage.Step(OnboardingStep.Priorities), onboarding.state.stage)
        val last = profiles.saved.last()
        assertEquals(emptyList<DayOfWeek>(), last.workDays)
        assertNull(last.workStartTime)
        assertNull(last.workEndTime)
    }

    @Test
    fun prioritiesAreCappedAtThreeAndNotRepeated() {
        val onboarding = model(FakeProfileRepository(saved(3)))
        assertTrue(onboarding.addPriority("Health"))
        assertFalse(onboarding.addPriority(" health "))
        assertEquals(FieldProblem.Local.PriorityDuplicate, onboarding.state.fieldProblems["priorities"])
        assertFalse(onboarding.addPriority("x".repeat(101)))
        assertTrue(onboarding.addPriority("Family"))
        assertTrue(onboarding.addPriority("Ship the mobile app"))
        assertFalse(onboarding.addPriority("Money"))
        assertEquals(listOf("Health", "Family", "Ship the mobile app"), onboarding.state.draft.priorities)
        onboarding.removePriority("Family")
        assertEquals(listOf("Health", "Ship the mobile app"), onboarding.state.draft.priorities)
    }

    @Test
    fun offlineSaveKeepsTheAnswersAndTheStep() {
        val profiles = FakeProfileRepository()
        val onboarding = model(profiles)
        onboarding.edit { it.copy(preferredName = "Sammy") }
        profiles.failNext(AppError.Offline)
        onboarding.advance()
        assertEquals(OnboardingStage.Step(OnboardingStep.Name), onboarding.state.stage)
        assertEquals(AppError.Offline, onboarding.state.problem)
        assertEquals("Sammy", onboarding.state.draft.preferredName)
        assertFalse(onboarding.state.isSaving)
    }

    @Test
    fun serverFieldErrorReturnsToTheStepThatShowsIt() {
        val profiles = FakeProfileRepository(saved(4))
        val onboarding = model(profiles)
        profiles.failNext(
            AppError.Validation(
                ServerMessage("Check the highlighted information and try again."),
                mapOf("timeZone" to listOf("Enter a valid IANA time zone, such as Asia/Kolkata.")),
            ),
        )
        onboarding.advance()
        assertEquals(OnboardingStage.Step(OnboardingStep.Name), onboarding.state.stage)
        assertEquals(FieldProblem.Server("Enter a valid IANA time zone, such as Asia/Kolkata."), onboarding.state.fieldProblems["timeZone"])
    }

    @Test
    fun backGoesToThePreviousStepWithoutSaving() {
        val profiles = FakeProfileRepository(saved(3))
        val onboarding = model(profiles)
        onboarding.back()
        assertEquals(OnboardingStage.Step(OnboardingStep.Work), onboarding.state.stage)
        repeat(3) { onboarding.back() }
        assertEquals(OnboardingStage.Step(OnboardingStep.Name), onboarding.state.stage)
        assertTrue(profiles.saved.isEmpty())
    }

    @Test
    fun awakeTimeWrapsPastMidnight() {
        val draft = OnboardingDraft.initial("Sam", "UTC")
        assertEquals(15 * 60 + 30, draft.awakeMinutes)
        assertEquals(18 * 60, draft.copy(bedtime = LocalTime.of(1, 0)).awakeMinutes)
    }

    @Test
    fun profileUpdateSendsNullWorkHours() {
        val json =
            apiJson.encodeToString(
                com.michaelos.core.model.ProfileUpdate
                    .serializer(),
                OnboardingDraft.initial("Sam", "UTC").update(2),
            )
        assertTrue(json, json.contains("\"workStartTime\":null"))
        assertTrue(json, json.contains("\"workEndTime\":null"))
    }
}
