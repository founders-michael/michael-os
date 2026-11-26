import Foundation
import Models
import TestSupport
import Testing

@testable import TasksFeature

@MainActor
struct TasksModelTests {
    private func model(_ tasks: FakeTaskRepository) -> TasksModel {
        TasksModel(
            tasks: tasks, intelligence: FakeTaskIntelligenceRepository(), profiles: TaskFixtures.profiles(), searchPause: .milliseconds(1))
    }

    @Test func theFirstLoadShowsThePageTheCountsAndTheProfileZone() async {
        let tasks = FakeTaskRepository(
            tasks: [TaskFixtures.task("a", due: "2026-11-10"), TaskFixtures.task("b")], today: TaskFixtures.today)
        let model = model(tasks)
        await model.load()
        let list = model.list
        #expect(list?.tasks.map(\.id) == ["a", "b"])
        #expect(list?.summary?.overdue == 1)
        #expect(list?.timeZone == "Asia/Kolkata")
        #expect(tasks.lists == [TaskQuery()])
    }

    @Test func noTasksIsEmptyAndAFailureWithNothingShownFailsTheScreen() async {
        let model = model(FakeTaskRepository(today: TaskFixtures.today))
        await model.load()
        guard case .empty = model.state else { return #expect(Bool(false), "expected empty") }

        let failing = FakeTaskRepository(today: TaskFixtures.today)
        // The list and the counts load together; the counts' failure alone is not shown.
        failing.fail(with: .offline, .offline)
        let failed = self.model(failing)
        await failed.load()
        #expect(failed.state == .failed(.offline))
        await failed.load()
        guard case .empty = failed.state else { return #expect(Bool(false), "a retry loads") }
    }

    @Test func filtersStartAgainFromPageOne() async {
        let tasks = FakeTaskRepository(
            tasks: [TaskFixtures.task("a", priority: .high), TaskFixtures.task("b", status: .completed)], today: TaskFixtures.today)
        let model = model(tasks)
        await model.load()
        model.select(view: .completed)
        await TaskFixtures.until { model.list?.query.view == .completed }
        #expect(model.list?.tasks.map(\.id) == ["b"])
        model.select(view: .all)
        model.select(priority: .high)
        await TaskFixtures.until { model.list?.query.priority == .high }
        #expect(model.list?.tasks.map(\.id) == ["a"])
        #expect(tasks.lists.last == TaskQuery(view: .all, priority: .high))
    }

    @Test func pagesLoadThirtyAtATimeAndALaterFailureKeepsWhatIsShown() async {
        let all = (1...45).map { TaskFixtures.task("t\($0)") }
        let tasks = FakeTaskRepository(tasks: all, today: TaskFixtures.today)
        let model = model(tasks)
        await model.load()
        #expect(model.list?.tasks.count == 30)
        #expect(model.list?.canLoadMore == true)
        // The page and the counts load together; whichever asks first takes a failure.
        tasks.fail(with: .offline, .offline)
        await model.loadMore()
        #expect(model.list?.tasks.count == 30)
        #expect(model.list?.moreProblem == .offline)
        await model.loadMore()
        #expect(model.list?.tasks.count == 45)
        #expect(model.list?.canLoadMore == false)
        #expect(model.list?.moreProblem == nil)
    }

    @Test func searchWaitsForAPauseAndOnlyTheLastSearchIsShown() async {
        let tasks = FakeTaskRepository(
            tasks: [TaskFixtures.task("a", title: "Send the investor update"), TaskFixtures.task("b", title: "Book the dentist")],
            today: TaskFixtures.today)
        let model = TasksModel(
            tasks: tasks, intelligence: FakeTaskIntelligenceRepository(), profiles: TaskFixtures.profiles(), searchPause: .milliseconds(30))
        await model.load()
        model.search("inv")
        model.search("dent")
        try? await _Concurrency.Task.sleep(for: .milliseconds(120))
        await TaskFixtures.until { model.list?.query.search == "dent" && model.list?.isRefreshing == false }
        #expect(model.list?.tasks.map(\.id) == ["b"])
        #expect(tasks.lists.map(\.search) == ["", "dent"], "the first search never left the device")
    }

    @Test func aSlowSearchOvertakenByANewerOneIsDropped() async {
        let tasks = FakeTaskRepository(
            tasks: [TaskFixtures.task("a", title: "Send the investor update"), TaskFixtures.task("b", title: "Book the dentist")],
            today: TaskFixtures.today)
        let model = model(tasks)
        await model.load()
        let gate = TaskFixtures.gate()
        tasks.hold(until: gate.wait)
        model.select(view: .pending)
        await TaskFixtures.until { tasks.lists.count == 2 }
        model.select(priority: .low)
        await TaskFixtures.until { model.list?.query.priority == .low }
        gate.release()
        await TaskFixtures.until { tasks.lists.count == 3 }
        #expect(model.list?.query.priority == .low)
        #expect(model.list?.tasks.isEmpty == true)
    }

    @Test func aToggleShowsAtOnceAndTakesTheServersTask() async {
        let tasks = FakeTaskRepository(tasks: [TaskFixtures.task("a")], today: TaskFixtures.today)
        let model = model(tasks)
        await model.load()
        let gate = TaskFixtures.gate()
        tasks.hold(until: gate.wait)
        let toggle = _Concurrency.Task { await model.toggle("a") }
        await TaskFixtures.until { model.list?.pending["a"] != nil }
        let shown = try? #require(model.list?.tasks.first)
        #expect(shown.map { model.list?.status(of: $0) } == .completed)
        gate.release()
        await toggle.value
        #expect(model.list?.pending.isEmpty == true)
        #expect(model.list?.tasks.first?.status == .completed)
        #expect(tasks.updates == [TaskUpdate(status: .completed)])
    }

    @Test func aRefusedToggleRollsBackAndSaysWhy() async {
        let tasks = FakeTaskRepository(tasks: [TaskFixtures.task("a")], today: TaskFixtures.today)
        let model = model(tasks)
        await model.load()
        tasks.fail(with: .forbidden(ServerMessage(text: "You cannot change this task.")))
        await model.toggle("a")
        #expect(model.list?.tasks.first?.status == .todo)
        #expect(model.list?.pending.isEmpty == true)
        let rollback = model.list?.rollbacks["a"]
        #expect(rollback?.completing == true)
        #expect(rollback.map(TaskRowView.message)?.contains("You cannot change this task.") == true)
    }

    @Test func rapidTogglingEndsInTheStateChosenLast() async {
        let tasks = FakeTaskRepository(tasks: [TaskFixtures.task("a")], today: TaskFixtures.today)
        let model = model(tasks)
        await model.load()
        let gate = TaskFixtures.gate()
        tasks.hold(until: gate.wait)
        let first = _Concurrency.Task { await model.toggle("a") }
        await TaskFixtures.until { tasks.updates.count == 1 }
        await model.toggle("a")
        await model.toggle("a")
        await model.toggle("a")
        gate.release()
        await first.value
        #expect(tasks.updates == [TaskUpdate(status: .completed), TaskUpdate(status: .todo)])
        #expect(model.list?.tasks.first?.status == .todo)
        #expect(model.list?.pending.isEmpty == true)
    }

    @Test func completingARepeatingTaskReloadsToShowTheNextOne() async {
        let tasks = FakeTaskRepository(tasks: [TaskFixtures.task("a", recurrence: TaskFixtures.weekly)], today: TaskFixtures.today)
        let model = model(tasks)
        await model.load()
        await model.toggle("a")
        #expect(tasks.lists.count == 2)
        let oneOff = FakeTaskRepository(tasks: [TaskFixtures.task("b")], today: TaskFixtures.today)
        let other = self.model(oneOff)
        await other.load()
        await other.toggle("b")
        #expect(oneOff.lists.count == 1, "a one-off task only refreshes the counts")
    }

    @Test func anotherScreensChangeRefreshesOnAppear() async {
        let tasks = FakeTaskRepository(tasks: [TaskFixtures.task("a")], today: TaskFixtures.today)
        let model = model(tasks)
        await model.appear(version: 0)
        await model.appear(version: 0)
        #expect(tasks.lists.count == 1, "nothing changed and the list is fresh")
        tasks.replace(TaskFixtures.task("a", status: .completed))
        await model.appear(version: 1)
        #expect(tasks.lists.count == 2)
        #expect(model.list?.tasks.first?.status == .completed)
    }

    @Test func aDeleteFromTheDetailLeavesTheList() async {
        let tasks = FakeTaskRepository(tasks: [TaskFixtures.task("a"), TaskFixtures.task("b")], today: TaskFixtures.today)
        let model = model(tasks)
        await model.load()
        model.removed("a")
        #expect(model.list?.tasks.map(\.id) == ["b"])
        #expect(model.list?.total == 1)
    }
}
