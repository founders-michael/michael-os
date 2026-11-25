import Foundation
import TestSupport
import Testing

@testable import Models

struct TaskDecodingTests {
    private let decoder = JSONDecoder.api()

    private func task(_ name: String) throws -> Task {
        try decoder.decode(TaskResponse.self, from: try ContractExamples.example(name)).task
    }

    private func json(_ value: some Encodable) throws -> String {
        let encoder = JSONEncoder.api()
        encoder.outputFormatting = .sortedKeys
        return String(bytes: try encoder.encode(value), encoding: .utf8) ?? ""
    }

    @Test func aRepeatingTaskWithAReminder() throws {
        let created = try task("task-create-repeating.json")
        let recurrence = try #require(created.activeRecurrence)
        #expect(recurrence.frequency == .weekly)
        #expect(recurrence.weekdays == [1, 4])
        #expect(recurrence.label == "Every Mon, Thu")
        #expect(created.remindAt == ISO8601DateFormatter().date(from: "2026-11-26T19:30:00Z"))
        #expect(created.pendingReminder != nil)
    }

    @Test func aStoppedRepeatIsKeptButNotActive() throws {
        let stopped = try task("task-patch-stop-repeat.json")
        #expect(stopped.recurrence?.active == false)
        #expect(stopped.activeRecurrence == nil)
        #expect(stopped.remindAt == nil)
    }

    @Test func editAndSkip() throws {
        let edited = try task("task-patch-edit.json")
        #expect(
            edited.recurrence?.rule
                == RecurrenceRule(frequency: .monthly, interval: 2, weekdays: [], monthDay: 15, endsOn: edited.recurrence?.endsOn))
        let skipped = try task("task-skip.json")
        #expect(skipped.dueDate == LocalDate("2027-01-15"))
    }

    @Test func responsesFromBeforeRepeatsStillDecode() throws {
        let old = try task("task-get.json")
        #expect(old.recurrence == nil)
        #expect(old.remindAt == nil)
        #expect(!old.reminderSent)
    }

    @Test func listSummaryAndDelete() throws {
        let page = try decoder.decode(TaskPage.self, from: try ContractExamples.example("tasks-list-filtered.json"))
        #expect(page.tasks.allSatisfy { $0.priority == .high && $0.status != .completed })
        let summary = try decoder.decode(TaskSummaryResponse.self, from: try ContractExamples.example("tasks-summary.json"))
        #expect(summary.summary.today == LocalDate("2026-11-17"))
        #expect(try decoder.decode(TaskDeleted.self, from: try ContractExamples.example("task-delete.json")).success)
    }

    @Test func theSaveSendsPlainFieldsAlwaysAndRepeatAndReminderOnlyWhenChanged() throws {
        let due = try #require(LocalDate("2026-11-27"))
        let unchanged = TaskSave(
            title: "Water the plants", description: nil, priority: .low, estimatedDurationMinutes: 15,
            remainingDurationMinutes: nil, dueDate: due, recurrence: nil, reminder: nil
        )
        let expected =
            #"{"description":null,"dueDate":"2026-11-27","estimatedDurationMinutes":15,"priority":"LOW","#
            + #""remainingDurationMinutes":null,"title":"Water the plants"}"#
        #expect(try json(unchanged) == expected)
        let changed = TaskSave(
            title: "Water the plants", description: nil, priority: .low, estimatedDurationMinutes: nil,
            remainingDurationMinutes: nil, dueDate: due,
            recurrence: .set(RecurrenceRule(frequency: .weekly, interval: 1, weekdays: [4, 1], monthDay: nil, endsOn: nil)),
            reminder: .clear
        )
        let body = try json(changed)
        #expect(body.contains(#""recurrence":{"endsOn":null,"frequency":"WEEKLY","interval":1,"monthDay":null,"weekdays":[1,4]}"#))
        #expect(body.contains(#""reminder":null"#))
    }

    @Test func aReminderIsADateAndATime() throws {
        let reminder = ReminderTime(date: try #require(LocalDate("2026-11-27")), time: LocalTime(hour: 8, minute: 30))
        #expect(try json(reminder) == #"{"date":"2026-11-27","time":"08:30"}"#)
    }

    @Test func theQuerySendsOnlyWhatIsSet() {
        let names = { (query: TaskQuery) in query.items.map { "\($0.name)=\($0.value ?? "")" } }
        #expect(names(TaskQuery()) == ["view=all", "sort=recent", "page=1", "limit=30"])
        let filtered = TaskQuery(view: .overdue, priority: .high, sort: .dueDate, search: "  invest  ", page: 2)
        #expect(names(filtered) == ["view=overdue", "sort=dueDate", "page=2", "limit=30", "priority=HIGH", "search=invest"])
    }

    @Test func weekdaysAreISO() throws {
        #expect(try #require(LocalDate("2026-11-23")).weekday == 1)
        #expect(try #require(LocalDate("2026-11-29")).weekday == 7)
    }
}
