import Foundation
import Models
import TestSupport
import Testing

@testable import TasksFeature

@MainActor
struct TaskEditorModelTests {
    private let due = LocalDate("2026-11-24")

    private func editor(_ task: Task? = nil, tasks: FakeTaskRepository = FakeTaskRepository()) -> TaskEditorModel {
        TaskEditorModel(task: task, timeZone: "Asia/Kolkata", today: TaskFixtures.today, tasks: tasks)
    }

    @Test func eachRuleIsCheckedBeforeAnythingIsSent() {
        var form = TaskForm()
        #expect(form.problems == [.title: .titleMissing])
        form.title = "  "
        #expect(form.problems[.title] == .titleMissing)
        form.title = "Call the bank"
        form.estimate = "4"
        form.remaining = "1441"
        #expect(form.problems == [.estimatedDurationMinutes: .minutesOutOfRange, .remainingDurationMinutes: .minutesOutOfRange])
        form.estimate = "5"
        form.remaining = "1440"
        #expect(form.problems.isEmpty)
        form.repeatRule.preset = .weekly
        #expect(form.problems[.recurrence] == .repeatNeedsDueDate)
        form.dueDate = due
        #expect(form.problems.isEmpty)
        form.repeatRule.preset = .custom
        form.repeatRule.frequency = .weekly
        form.repeatRule.weekdays = []
        #expect(form.problems[.recurrence] == .repeatNeedsWeekday)
        form.repeatRule.weekdays = [1]
        form.repeatRule.endsOn = LocalDate("2026-11-20")
        #expect(form.problems[.recurrence] == .endsBeforeDueDate)
        form.repeatRule.endsOn = nil
        form.reminderDate = due
        #expect(form.problems[.reminder] == .reminderHalfSet)
        form.reminderTime = LocalTime(hour: 9, minute: 0)
        #expect(form.problems.isEmpty)
    }

    @Test func aPastDueDateIsAllowed() {
        var form = TaskForm()
        form.title = "Send the investor update"
        form.dueDate = LocalDate("2026-11-01")
        #expect(form.problems.isEmpty)
    }

    @Test func pastedTextIsCutAtTheLimitsAndMinutesTakeDigitsOnly() {
        let model = editor()
        model.edit { $0.title = String(repeating: "a", count: 200) }
        model.edit { $0.notes = String(repeating: "b", count: 6000) }
        model.edit { $0.estimate = "4 5 min" }
        #expect(model.form.title.count == TaskForm.titleLimit)
        #expect(model.form.notes.count == TaskForm.notesLimit)
        #expect(model.form.estimate == "45")
    }

    @Test func presetsTakeTheirDayFromTheDueDate() {
        var draft = RepeatDraft()
        draft.preset = .weekly
        #expect(draft.rule(dueDate: due)?.weekdays == [2])
        draft.preset = .monthly
        #expect(draft.rule(dueDate: due)?.monthDay == 24)
        draft.preset = .weekdays
        #expect(draft.rule(dueDate: due)?.weekdays == [1, 2, 3, 4, 5])
        draft.preset = .custom
        draft.frequency = .monthly
        draft.interval = 120
        draft.monthDay = 31
        #expect(draft.rule(dueDate: due) == RecurrenceRule(frequency: .monthly, interval: 99, weekdays: [], monthDay: 31, endsOn: nil))
    }

    @Test func aSavedRepeatOpensAsItsClosestPreset() {
        #expect(RepeatDraft(TaskFixtures.weekly).preset == .weekly)
        let fortnightly = TaskRecurrence(
            frequency: .weekly, interval: 2, weekdays: [1, 3], monthDay: nil, endsOn: nil, active: true, label: "")
        #expect(RepeatDraft(fortnightly).preset == .custom)
        let weekdays = TaskRecurrence(
            frequency: .weekly, interval: 1, weekdays: [1, 2, 3, 4, 5], monthDay: nil, endsOn: nil, active: true, label: "")
        #expect(RepeatDraft(weekdays).preset == .weekdays)
    }

    @Test func aNewTaskIsCreatedAndTheSheetSaysSavedOnlyAfterTheServerAnswers() async {
        let tasks = FakeTaskRepository()
        let model = editor(tasks: tasks)
        model.edit {
            $0.title = " Call the bank "
            $0.dueDate = due
            $0.repeatRule.preset = .weekly
        }
        let gate = TaskFixtures.gate()
        tasks.hold(until: gate.wait)
        let save = _Concurrency.Task { await model.save() }
        await TaskFixtures.until { model.status == .saving }
        #expect(model.status == .saving)
        gate.release()
        await save.value
        guard case .saved(let saved) = model.status else { return #expect(Bool(false), "expected saved") }
        #expect(saved.title == "Call the bank")
        guard case .save(let body, nil) = tasks.calls.first else { return #expect(Bool(false), "expected a create") }
        #expect(body.recurrence == .set(RecurrenceRule(frequency: .weekly, interval: 1, weekdays: [2], monthDay: nil, endsOn: nil)))
        #expect(body.reminder == nil)
    }

    @Test func anEditSendsTheRepeatAndReminderOnlyWhenTheyChange() async {
        let task = TaskFixtures.task(
            "a", due: "2026-11-24", recurrence: TaskFixtures.weekly, remindAt: ISO8601DateFormatter().date(from: "2026-11-24T03:30:00Z"))
        let tasks = FakeTaskRepository(tasks: [task])
        let model = editor(task, tasks: tasks)
        #expect(model.form.reminderTime == LocalTime(hour: 9, minute: 0), "03:30 UTC is 09:00 in Kolkata")
        model.edit { $0.title = "Renamed" }
        await model.save()
        guard case .save(let unchanged, "a") = tasks.calls.last else { return #expect(Bool(false), "expected an edit") }
        #expect(unchanged.recurrence == nil)
        #expect(unchanged.reminder == nil)

        let again = editor(task, tasks: tasks)
        again.edit {
            $0.repeatRule.preset = .none
            $0.reminderDate = nil
            $0.reminderTime = nil
        }
        await again.save()
        guard case .save(let stopped, "a") = tasks.calls.last else { return #expect(Bool(false), "expected an edit") }
        #expect(stopped.recurrence == .clear)
        #expect(stopped.reminder == .clear)
    }

    @Test func aSentReminderStartsEmptySoANewOneCanBeSet() {
        let task = TaskFixtures.task("a", remindAt: .now, reminderSent: true)
        let model = editor(task)
        #expect(model.form.reminderDate == nil)
        #expect(!model.hasChanges)
    }

    @Test func theServersFieldErrorsLandOnTheirFields() async {
        let tasks = FakeTaskRepository()
        tasks.fail(
            with: .validation(
                ServerMessage(text: "Check the task details and try again."),
                fields: ["estimatedDurationMinutes": ["Too big: expected number to be <=1440"]]
            ))
        let model = editor(tasks: tasks)
        model.edit { $0.title = "Call the bank" }
        await model.save()
        #expect(model.status == .editing)
        #expect(model.message(for: .estimatedDurationMinutes) == "Too big: expected number to be <=1440")
        #expect(model.failure == nil)
        model.edit { $0.estimate = "30" }
        #expect(model.message(for: .estimatedDurationMinutes) == nil, "editing the field clears the server's reason")
    }

    @Test func aConnectionFailureKeepsWhatWasTyped() async {
        let tasks = FakeTaskRepository()
        tasks.fail(with: .offline)
        let model = editor(tasks: tasks)
        model.edit { $0.title = "Call the bank" }
        await model.save()
        #expect(model.failure == .offline)
        #expect(model.form.title == "Call the bank")
        #expect(model.hasChanges)
    }

    @Test func problemsShowOnlyAfterSaveIsTried() async {
        let tasks = FakeTaskRepository()
        let model = editor(tasks: tasks)
        #expect(model.message(for: .title) == nil)
        await model.save()
        #expect(model.message(for: .title) != nil)
        #expect(tasks.calls.isEmpty)
    }
}
