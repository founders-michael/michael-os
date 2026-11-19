import Foundation
import Models
import TestSupport
import Testing

@testable import MyDayFeature

@MainActor
struct MyDayModelTests {
    private final class Clock {
        var now = Date(timeIntervalSince1970: 1_795_000_000)
    }

    private let clock = Clock()
    private let tasks: FakeTaskRepository
    private let habits = FakeHabitRepository()
    private let days: FakeMyDayRepository
    private let example: MyDay

    init() throws {
        example = try MyDayExamples.day()
        days = FakeMyDayRepository(day: example)
        tasks = FakeTaskRepository(tasks: example.tasks?.dailyTasks.map(\.task) ?? [])
    }

    private func model(requestedDate: LocalDate? = nil) -> MyDayModel {
        let clock = clock
        return MyDayModel(days: days, tasks: tasks, habits: habits, requestedDate: requestedDate) { clock.now }
    }

    private func loaded() async -> MyDayModel {
        let model = model()
        await model.appear()
        return model
    }

    private static let dentist = "cmwktkg3p000440v3mwsa92bo"
    private static let walk = "cmwktkgu1000940v3jdfg8155"
    private static let today = LocalDate("2026-11-17")

    private func row(_ model: MyDayModel, _ id: String) throws -> MyDayTaskRow {
        try #require(model.day?.tasks.first { $0.id == id })
    }

    private func habit(_ model: MyDayModel) throws -> MyDayHabitRow {
        try #require(model.day?.habits.first)
    }

    /// What the server returns once a write has been saved.
    private func serverSaves(_ change: (inout MyDay) -> Void) {
        var day = days.day
        change(&day)
        days.day = day
    }

    private static func gate() -> (wait: @Sendable () async -> Void, release: () -> Void) {
        let (stream, continuation) = AsyncStream<Void>.makeStream()
        return ({ for await _ in stream { return } }, { continuation.yield() })
    }

    @Test func firstLoadShowsTheServersToday() async throws {
        let model = await loaded()
        guard case .content(let day) = model.state else {
            Issue.record("Expected content, got \(model.state)")
            return
        }
        #expect(days.requests == [nil])
        #expect(day.isToday)
        #expect(day.tasks.map(\.status) == [.todo, .todo, .inProgress])
        #expect(day.tasks.allSatisfy { $0.canToggle })
        #expect(day.habits.map(\.isDone) == [true])
    }

    @Test func nothingForTheDayIsOneEmptyState() async throws {
        var day = example
        day.tasks?.dailyTasks = []
        day.habits?.habits = []
        days.day = day
        let model = await loaded()
        guard case .empty(let content) = model.state else {
            Issue.record("Expected empty, got \(model.state)")
            return
        }
        #expect(content.myDay.greetingName == "Sam")
    }

    @Test func aSectionThatFailedIsNotEmpty() async throws {
        var day = example
        day.tasks = nil
        day.habits?.habits = []
        days.day = day
        let model = await loaded()
        guard case .content(let content) = model.state else {
            Issue.record("Expected content, got \(model.state)")
            return
        }
        #expect(content.tasks.isEmpty)
        #expect(content.myDay.tasks == nil)
    }

    @Test func failureWithNothingShownCanBeRetried() async throws {
        days.fail(with: .offline)
        let model = await loaded()
        #expect(model.state == .failed(.offline))
        await model.load()
        #expect(model.day != nil)
    }

    @Test func refreshKeepsTheDayOnScreenAndSaysWhyItFailed() async throws {
        let model = await loaded()
        let gate = Self.gate()
        days.hold(until: gate.wait)
        async let refreshing: Void = model.refresh()
        while model.day?.isRefreshing != true { await _Concurrency.Task.yield() }
        #expect(model.day?.tasks.count == 3)
        days.fail(with: .timeout)
        gate.release()
        await refreshing
        #expect(model.day?.isRefreshing == false)
        #expect(model.day?.refreshProblem == .timeout)
        #expect(model.day?.tasks.count == 3)

        await model.refresh()
        #expect(model.day?.refreshProblem == nil)
    }

    @Test func returningAfterAMinuteRefreshesAndSoonerDoesNot() async throws {
        let model = await loaded()
        clock.now += 59
        await model.appear()
        #expect(days.requests.count == 1)
        clock.now += 2
        await model.appear()
        #expect(days.requests.count == 2)
    }

    @Test func midnightMovesTodayToTheNewDay() async throws {
        let model = await loaded()
        var tomorrow = example
        tomorrow.today = try #require(LocalDate("2026-11-18"))
        tomorrow.selectedDate = tomorrow.today
        days.day = tomorrow
        clock.now += 3_600
        await model.appear()
        #expect(days.requests == [nil, nil])
        #expect(model.day?.myDay.selectedDate == LocalDate("2026-11-18"))
        #expect(model.day?.isToday == true)
    }

    @Test func steppingAsksForThatDateAndBackToTodayFollowsTheServer() async throws {
        let model = await loaded()
        model.step(by: -1)
        #expect(model.state == .loading)
        #expect(model.requestedDate == LocalDate("2026-11-16"))
        await model.appear()
        #expect(days.requests.last == LocalDate("2026-11-16"))

        var yesterday = example
        yesterday.selectedDate = try #require(LocalDate("2026-11-16"))
        days.day = yesterday
        await model.load()
        model.step(by: 1)
        #expect(model.requestedDate == nil)

        await model.load()
        model.step(by: -1)
        model.showToday()
        #expect(model.requestedDate == nil)
        #expect(model.state == .loading)
    }

    @Test func aPastDateShowsThatDaysStatusesAndCannotBeChanged() async throws {
        var past = example
        past.selectedDate = try #require(LocalDate("2026-11-16"))
        past.tasks?.dailyTasks[0].statusAtSelectedDate = nil
        past.tasks?.dailyTasks[1].statusAtSelectedDate = .completed
        past.habits?.habits[0].checkIns = [
            HabitCheckIn(id: "old", localDate: try #require(LocalDate("2026-11-16")), completedAt: .now)
        ]
        days.day = past
        let model = model(requestedDate: past.selectedDate)
        await model.appear()
        let day = try #require(model.day)
        #expect(day.isReadOnly)
        #expect(day.tasks.map(\.status) == [nil, .completed, .inProgress])
        #expect(day.tasks.allSatisfy { !$0.canToggle })
        #expect(day.habits.map(\.isDone) == [true])
        #expect(day.habits.allSatisfy { !$0.canToggle })

        await model.toggleTask(Self.dentist)
        await model.toggleHabit(Self.walk)
        #expect(tasks.updates.isEmpty)
        #expect(habits.calls.isEmpty)
    }

    @Test func todayListsOverdueTasksFirst() async throws {
        var day = example
        let overdue = day.tasks?.sections.backlog.filter { $0.id == Self.dentist } ?? []
        day.tasks?.sections.overdue = overdue
        days.day = day
        let model = await loaded()
        #expect(model.day?.tasks.map(\.id).first == Self.dentist)
        #expect(model.day?.tasks.count == 3)
    }

    @Test func aCompletedOverdueTaskKeepsItsPlace() async throws {
        var day = example
        let overdueTask = try #require(day.tasks?.dailyTasks[1].task)
        let pastDue = Task(
            id: overdueTask.id, title: overdueTask.title, description: nil, status: .todo, priority: .high,
            estimatedDurationMinutes: nil, remainingDurationMinutes: nil, dueDate: LocalDate("2026-11-15"),
            completedAt: nil, createdAt: overdueTask.createdAt, updatedAt: overdueTask.updatedAt
        )
        day.tasks?.dailyTasks[1].task = pastDue
        day.tasks?.sections.overdue = []
        days.day = day
        let model = await loaded()
        #expect(model.day?.tasks.first?.id == pastDue.id)
        #expect(model.day?.tasks.first?.isOverdue == true)
    }

    @Test func completingATaskShowsAtOnceThenTakesTheServersAnswer() async throws {
        let model = await loaded()
        let gate = Self.gate()
        tasks.hold(until: gate.wait)
        async let saving: Void = model.toggleTask(Self.dentist)
        while try row(model, Self.dentist).isSaving == false { await _Concurrency.Task.yield() }
        #expect(try row(model, Self.dentist).isDone)
        #expect(try row(model, Self.dentist).canToggle == false)

        await model.toggleTask(Self.dentist)
        serverSaves { $0.tasks?.dailyTasks[0].statusAtSelectedDate = .completed }
        gate.release()
        await saving
        #expect(tasks.updates == [TaskUpdate(status: .completed)])
        let done = try row(model, Self.dentist)
        #expect(done.isDone)
        #expect(!done.isSaving)
        #expect(done.rollback == nil)
        #expect(days.requests.count == 2, "a write refreshes the day's counts in place")
    }

    @Test func aRefusedTaskChangeRollsBackAndSaysWhy() async throws {
        let model = await loaded()
        let refusal = AppError.notFound(ServerMessage(text: "Task not found."))
        tasks.fail(with: refusal)
        await model.toggleTask(Self.dentist)
        let rolledBack = try row(model, Self.dentist)
        #expect(rolledBack.status == .todo)
        #expect(!rolledBack.isSaving)
        #expect(rolledBack.rollback == MyDayRollback(action: .complete, error: refusal))
        #expect(days.requests.count == 1)

        serverSaves { $0.tasks?.dailyTasks[0].statusAtSelectedDate = .completed }
        await model.toggleTask(Self.dentist)
        #expect(try row(model, Self.dentist).rollback == nil)
        #expect(try row(model, Self.dentist).isDone)
    }

    @Test func aCompletedTaskReopens() async throws {
        var day = example
        day.tasks?.dailyTasks[0].statusAtSelectedDate = .completed
        days.day = day
        let model = await loaded()
        await model.toggleTask(Self.dentist)
        #expect(tasks.updates == [TaskUpdate(status: .todo)])
    }

    @Test func undoingACheckInShowsAtOnceThenSticks() async throws {
        let model = await loaded()
        let gate = Self.gate()
        habits.hold(until: gate.wait)
        async let saving: Void = model.toggleHabit(Self.walk)
        while try habit(model).isSaving == false { await _Concurrency.Task.yield() }
        #expect(try habit(model).isDone == false)
        serverSaves { $0.habits?.habits[0].completedToday = false }
        gate.release()
        await saving
        #expect(habits.calls == [.undo(habit: Self.walk, checkIn: "cmwktkhwj000b40v389b6vire")])
        #expect(try habit(model).isDone == false)
        #expect(try habit(model).isSaving == false)
    }

    @Test func checkingInSendsTheServersToday() async throws {
        var day = example
        day.habits?.habits[0].completedToday = false
        day.habits?.habits[0].checkIns = []
        days.day = day
        let model = await loaded()
        serverSaves { $0.habits?.habits[0].completedToday = true }
        await model.toggleHabit(Self.walk)
        #expect(habits.calls == [.checkIn(habit: Self.walk, date: try #require(Self.today))])
        #expect(try habit(model).isDone)
    }

    @Test func aRefusedCheckInRollsBackAndSaysWhy() async throws {
        var day = example
        day.habits?.habits[0].completedToday = false
        day.habits?.habits[0].checkIns = []
        days.day = day
        let model = await loaded()
        let refusal = AppError.validation(ServerMessage(text: "This habit isn't scheduled for that local date."), fields: [:])
        habits.fail(with: refusal)
        await model.toggleHabit(Self.walk)
        #expect(try habit(model).isDone == false)
        #expect(try habit(model).rollback == MyDayRollback(action: .checkIn, error: refusal))

        habits.fail(with: .conflict(ServerMessage(text: "Reactivate this habit before checking it in.")))
        await model.toggleHabit(Self.walk)
        #expect(try habit(model).rollback?.error == .conflict(ServerMessage(text: "Reactivate this habit before checking it in.")))
    }

    @Test func undoingACheckInAlreadyUndoneElsewhereAgreesWithTheServer() async throws {
        let model = await loaded()
        habits.fail(with: .notFound(ServerMessage(text: "Check-in not found.")))
        serverSaves { $0.habits?.habits[0].completedToday = false }
        await model.toggleHabit(Self.walk)
        #expect(try habit(model).isDone == false)
        #expect(try habit(model).rollback == nil)
    }

    @Test func aWriteThatFinishesAfterTheDayChangedLeavesTheNewDayAlone() async throws {
        let model = await loaded()
        let gate = Self.gate()
        tasks.hold(until: gate.wait)
        async let saving: Void = model.toggleTask(Self.dentist)
        while try row(model, Self.dentist).isSaving == false { await _Concurrency.Task.yield() }
        model.step(by: -1)
        gate.release()
        await saving
        #expect(model.state == .loading)
    }
}
