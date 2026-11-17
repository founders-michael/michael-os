import Foundation
import Models
import TestSupport
import Testing

@testable import OnboardingFeature

struct OnboardingModelTests {
    private func model(_ profiles: FakeProfileRepository = FakeProfileRepository()) -> OnboardingModel {
        OnboardingModel(profiles: profiles, suggestedName: "Sam Rivera", deviceTimeZone: "Europe/Lisbon")
    }

    private func savedProfile(step: Int, completed: Bool = false) -> Profile {
        let draft = OnboardingDraft.initial(name: "Sam", timeZone: "Asia/Kolkata")
        return Profile(draft.update(onboardingStep: step), completed: completed)
    }

    @Test func newUserStartsAtTheFirstStepWithTheirNameAndThePhonesZone() async {
        let onboarding = model()
        await onboarding.load()
        #expect(onboarding.state.stage == .step(.name))
        #expect(onboarding.state.draft.preferredName == "Sam Rivera")
        #expect(onboarding.state.draft.timeZone == "Europe/Lisbon")
        #expect(onboarding.state.draft.wakeUpTime == LocalTime(hour: 7, minute: 0))
    }

    @Test(arguments: [(0, OnboardingStep.name), (1, .name), (2, .sleep), (3, .priorities), (4, .focus), (5, .focus)])
    func resumesAtTheSavedStepWithTheSavedAnswers(serverStep: Int, expected: OnboardingStep) async {
        let onboarding = model(FakeProfileRepository(profile: savedProfile(step: serverStep)))
        await onboarding.load()
        #expect(onboarding.state.stage == .step(expected))
        #expect(onboarding.state.draft.timeZone == "Asia/Kolkata")
    }

    @Test func aCompletedProfileFinishesAtOnce() async {
        let onboarding = model(FakeProfileRepository(profile: savedProfile(step: 5, completed: true)))
        await onboarding.load()
        #expect(onboarding.state.stage == .finished)
    }

    @Test func loadFailureIsShownAndCanBeRetried() async {
        let profiles = FakeProfileRepository()
        profiles.fail(with: .offline)
        let onboarding = model(profiles)
        await onboarding.load()
        #expect(onboarding.state.stage == .failed(.offline))
        await onboarding.load()
        #expect(onboarding.state.stage == .step(.name))
    }

    @Test func eachStepSavesEveryAnswerAndWhereToResume() async {
        let profiles = FakeProfileRepository()
        let onboarding = model(profiles)
        await onboarding.load()
        for _ in OnboardingStep.allCases { await onboarding.advance() }
        #expect(profiles.saved.map(\.onboardingStep) == [2, 2, 3, 4, 5])
        #expect(profiles.completes == 1)
        #expect(onboarding.state.stage == .finished)
        let last = profiles.saved.last
        #expect(last?.workStartTime == LocalTime(hour: 9, minute: 0))
        #expect(last?.workEndTime == LocalTime(hour: 18, minute: 0))
        #expect(last?.workDays == [.monday, .tuesday, .wednesday, .thursday, .friday])
    }

    @Test func blankNameStaysOnTheStep() async {
        let profiles = FakeProfileRepository()
        let onboarding = model(profiles)
        await onboarding.load()
        onboarding.edit { $0.preferredName = "   " }
        await onboarding.advance()
        #expect(onboarding.state.stage == .step(.name))
        #expect(onboarding.state.fieldErrors["preferredName"] == "Add a preferred name.")
        #expect(profiles.saved.isEmpty)
        onboarding.edit { $0.preferredName = "Sam" }
        #expect(onboarding.state.fieldErrors.isEmpty)
    }

    @Test func workHoursMustEndAfterTheyStart() async {
        let onboarding = model(FakeProfileRepository(profile: savedProfile(step: 2)))
        await onboarding.load()
        await onboarding.advance()
        #expect(onboarding.state.stage == .step(.work))
        onboarding.edit {
            $0.workStartTime = LocalTime(hour: 18, minute: 0)
            $0.workEndTime = LocalTime(hour: 9, minute: 0)
        }
        await onboarding.advance()
        #expect(onboarding.state.stage == .step(.work))
        #expect(onboarding.state.fieldErrors["workEndTime"] == "End time must be after start time.")
    }

    @Test func noFixedHoursSendsNoDaysAndNullHours() async {
        let profiles = FakeProfileRepository(profile: savedProfile(step: 2))
        let onboarding = model(profiles)
        await onboarding.load()
        await onboarding.advance()
        await onboarding.skipWorkHours()
        #expect(onboarding.state.stage == .step(.priorities))
        let saved = profiles.saved.last
        #expect(saved?.workDays == [])
        #expect(saved?.workStartTime == nil)
        #expect(saved?.workEndTime == nil)
    }

    @Test func prioritiesAreCappedAtThreeAndNotRepeated() async {
        let onboarding = model(FakeProfileRepository(profile: savedProfile(step: 3)))
        await onboarding.load()
        #expect(onboarding.addPriority("Health"))
        #expect(!onboarding.addPriority(" health "))
        #expect(onboarding.state.fieldErrors["priorities"] == "That one is already on the list.")
        #expect(!onboarding.addPriority(String(repeating: "x", count: 101)))
        #expect(onboarding.addPriority("Family"))
        #expect(onboarding.addPriority("Ship the mobile app"))
        #expect(!onboarding.addPriority("Money"))
        #expect(onboarding.state.draft.priorities == ["Health", "Family", "Ship the mobile app"])
        onboarding.removePriority("Family")
        #expect(onboarding.state.draft.priorities == ["Health", "Ship the mobile app"])
    }

    @Test func offlineSaveKeepsTheAnswersAndTheStep() async {
        let profiles = FakeProfileRepository()
        let onboarding = model(profiles)
        await onboarding.load()
        onboarding.edit { $0.preferredName = "Sammy" }
        profiles.fail(with: .offline)
        await onboarding.advance()
        #expect(onboarding.state.stage == .step(.name))
        #expect(onboarding.state.problem == .offline)
        #expect(onboarding.state.draft.preferredName == "Sammy")
        #expect(!onboarding.state.isSaving)
    }

    @Test func serverFieldErrorReturnsToTheStepThatShowsIt() async {
        let profiles = FakeProfileRepository(profile: savedProfile(step: 4))
        let onboarding = model(profiles)
        await onboarding.load()
        profiles.fail(
            with: .validation(
                ServerMessage(text: "Check the highlighted information and try again."),
                fields: ["timeZone": ["Enter a valid IANA time zone, such as Asia/Kolkata."]]
            ))
        await onboarding.advance()
        #expect(onboarding.state.stage == .step(.name))
        #expect(onboarding.state.fieldErrors["timeZone"] == "Enter a valid IANA time zone, such as Asia/Kolkata.")
    }

    @Test func backGoesToThePreviousStepWithoutSaving() async {
        let profiles = FakeProfileRepository(profile: savedProfile(step: 3))
        let onboarding = model(profiles)
        await onboarding.load()
        onboarding.back()
        #expect(onboarding.state.stage == .step(.work))
        onboarding.back()
        onboarding.back()
        onboarding.back()
        #expect(onboarding.state.stage == .step(.name))
        #expect(profiles.saved.isEmpty)
    }

    @Test func awakeTimeWrapsPastMidnight() {
        var draft = OnboardingDraft.initial(name: "Sam", timeZone: "UTC")
        #expect(draft.awakeMinutes == 15 * 60 + 30)
        draft.bedtime = LocalTime(hour: 1, minute: 0)
        #expect(draft.awakeMinutes == 18 * 60)
    }

    @Test func profileUpdateSendsNullWorkHours() throws {
        let draft = OnboardingDraft.initial(name: "Sam", timeZone: "UTC")
        let json = try #require(String(bytes: try JSONEncoder().encode(draft.update(onboardingStep: 2)), encoding: .utf8))
        #expect(json.contains(#""workStartTime":null"#))
        #expect(json.contains(#""workEndTime":null"#))
    }
}
