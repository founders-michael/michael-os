import Foundation
import Models
import TestSupport
import Testing

@testable import TasksFeature

@MainActor
struct TaskDetailModelTests {
    private func detail(_ task: Task, tasks: FakeTaskRepository) -> TaskDetailModel {
        TaskDetailModel(id: task.id, shown: task, timeZone: "Asia/Kolkata", today: TaskFixtures.today, tasks: tasks)
    }

    @Test func aTaskDeletedElsewhereShowsNotFound() async {
        let task = TaskFixtures.task("a")
        let tasks = FakeTaskRepository()
        let model = detail(task, tasks: tasks)
        await model.load()
        #expect(model.state == .notFound)
    }

    @Test func theStatusMovesAtOnceAndComesBackWhenRefused() async {
        let task = TaskFixtures.task("a")
        let tasks = FakeTaskRepository(tasks: [task])
        let model = detail(task, tasks: tasks)
        await model.setStatus(.inProgress)
        #expect(model.detail?.task.status == .inProgress)
        tasks.fail(with: .offline)
        await model.setStatus(.completed)
        #expect(model.detail?.status == .inProgress)
        #expect(model.detail?.problem?.action == .status)
    }

    @Test func skippingMovesARepeatingTaskAndAStoppedSeriesSaysWhy() async {
        let task = TaskFixtures.task("a", due: "2026-11-24", recurrence: TaskFixtures.weekly)
        let tasks = FakeTaskRepository(tasks: [task])
        let model = detail(task, tasks: tasks)
        await model.skip()
        #expect(model.detail?.task.dueDate == LocalDate("2026-12-01"))
        tasks.fail(with: .conflict(ServerMessage(text: "This task no longer repeats.", code: "SERIES_STOPPED")))
        await model.skip()
        #expect(model.detail?.problem.map(TaskDetailScreen.message)?.contains("no longer repeats") == true)
    }

    @Test func aOneOffTaskCannotBeSkipped() async {
        let task = TaskFixtures.task("a")
        let tasks = FakeTaskRepository(tasks: [task])
        let model = detail(task, tasks: tasks)
        await model.skip()
        #expect(tasks.calls.isEmpty)
    }

    @Test func deletingEndsTheScreenAndAFailureKeepsIt() async {
        let task = TaskFixtures.task("a")
        let tasks = FakeTaskRepository(tasks: [task])
        let model = detail(task, tasks: tasks)
        tasks.fail(with: .offline)
        await model.delete()
        #expect(model.detail?.problem?.action == .delete)
        await model.delete()
        #expect(model.state == .deleted)
        #expect(tasks.tasks.isEmpty)
    }
}
