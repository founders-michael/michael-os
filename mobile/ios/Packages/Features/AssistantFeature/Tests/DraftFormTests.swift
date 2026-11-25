import Foundation
import Models
import Testing

@testable import AssistantFeature

/// The draft form for each kind, against the web app's draft-model.ts.
struct DraftFormTests {
    private func form(_ kind: DraftKind, _ values: [String: DraftValue], zone: String = "Asia/Kolkata") -> DraftForm {
        DraftForm(RecordDraft(kind: kind, values: values, timeZone: zone))
    }

    @Test func aTaskOpensWithItsDefaultPriorityAndPostsOnlyWhatIsFilled() {
        var task = form(.task, ["title": .text("  Call the bank  ")])
        #expect(task.fields.map(\.name) == ["title", "description", "priority", "dueDate", "estimatedDurationMinutes"])
        #expect(task.text("priority") == "MEDIUM")
        #expect(task.missing.isEmpty)
        #expect(
            task.submission
                == .task(
                    TaskCreate(title: "Call the bank", description: nil, priority: .medium, dueDate: nil, estimatedDurationMinutes: nil))
        )
        task.set("dueDate", to: .text("2026-11-24"))
        task.set("estimatedDurationMinutes", to: .number(45))
        task.set("priority", to: .text("HIGH"))
        #expect(
            task.submission
                == .task(
                    TaskCreate(
                        title: "Call the bank", description: nil, priority: .high, dueDate: LocalDate("2026-11-24"),
                        estimatedDurationMinutes: 45)
                )
        )
    }

    @Test func aRequiredFieldClearedByTheUserBlocksTheSave() {
        var task = form(.task, ["title": .text("Call the bank")])
        task.set("title", to: .text("   "))
        #expect(task.missing == ["title"])
        #expect(task.submission == nil)
    }

    @Test func aGoalAlwaysSendsProgress() {
        let goal = form(.goal, ["title": .text("Run a 10k"), "category": .text("Health"), "targetDate": .text("2027-03-01")])
        #expect(goal.fields.map(\.name) == ["title", "description", "category", "targetDate", "progress"])
        #expect(
            goal.submission
                == .goal(
                    GoalCreate(title: "Run a 10k", description: nil, category: "Health", targetDate: LocalDate("2027-03-01"), progress: 0))
        )
    }

    @Test func aDailyHabitHasNoDaysAndSelectedDaysNeedsOne() {
        var habit = form(.habit, ["title": .text("Stretch"), "weekdays": .days([1, 3])])
        #expect(habit.days("weekdays").isEmpty)
        #expect(!habit.fields.map(\.name).contains("weekdays"))
        habit.set("frequency", to: .text("SELECTED_DAYS"))
        #expect(habit.fields.map(\.name).contains("weekdays"))
        #expect(habit.missing == ["weekdays"])
        #expect(habit.submission == nil)
        habit.set("weekdays", to: .days([1, 5]))
        #expect(
            habit.submission
                == .habit(
                    HabitCreate(
                        title: "Stretch", description: nil, frequency: .selectedDays, weekdays: [1, 5], startTime: nil, endTime: nil))
        )
        habit.set("frequency", to: .text("DAILY"))
        #expect(habit.days("weekdays").isEmpty)
    }

    @Test func aHabitEndTimeNeedsAStartTimeAndDiffersFromIt() {
        var habit = form(.habit, ["title": .text("Walk"), "endTime": .text("07:30")])
        guard case .habit(let noStart) = habit.submission else {
            Issue.record("A habit with a title can be saved")
            return
        }
        #expect(noStart.startTime == nil && noStart.endTime == nil)
        habit.set("startTime", to: .text("07:30"))
        guard case .habit(let same) = habit.submission else { return }
        #expect(same.startTime == LocalTime("07:30") && same.endTime == nil)
        habit.set("endTime", to: .text("08:00"))
        guard case .habit(let both) = habit.submission else { return }
        #expect(both.endTime == LocalTime("08:00"))
    }

    @Test func aCalendarEventTurnsItsLocalTimesIntoInstantsInTheDraftsZone() throws {
        let event = form(
            .calendarEvent,
            ["title": .text("Dentist"), "date": .text("2026-11-24"), "startTime": .text("15:00"), "endTime": .text("15:30")],
            zone: "Pacific/Auckland"
        )
        guard case .calendarEvent(let body) = event.submission else {
            Issue.record("A complete event can be saved")
            return
        }
        #expect(body.eventType == .commitment)
        #expect(body.schedulingMode == .fixed)
        #expect(body.timeZone == "Pacific/Auckland")
        #expect(body.startAt == Date(timeIntervalSince1970: 1_795_485_600))
        #expect(body.endAt.timeIntervalSince(body.startAt) == 1800)
        let encoded = try #require(String(data: try JSONEncoder.api().encode(body), encoding: .utf8))
        #expect(encoded.contains(#""startAt":"2026-11-24T02:00:00Z""#))
    }

    @Test func anEventMustEndAfterItStartsAndNeedsItsRequiredFields() {
        var event = form(.calendarEvent, ["title": .text("Dentist"), "date": .text("2026-11-24")])
        #expect(event.missing == ["startTime", "endTime"])
        event.set("startTime", to: .text("15:00"))
        event.set("endTime", to: .text("14:00"))
        #expect(event.missing.isEmpty)
        #expect(event.submission == nil)
    }

    @Test func aWallClockTimeTheZoneSkipsCannotBeSaved() throws {
        let date = try #require(LocalDate("2027-03-14"))
        #expect(DraftForm.instant(date, LocalTime(hour: 2, minute: 30), in: "America/New_York") == nil)
        #expect(DraftForm.instant(date, LocalTime(hour: 3, minute: 30), in: "America/New_York") != nil)
    }

    @Test func aMemoryKeepsItsPrivacyChoice() {
        var memory = form(.memory, ["content": .text("I prefer deep work before lunch.")])
        #expect(memory.text("sensitivity") == "STANDARD")
        memory.set("sensitivity", to: .text("SENSITIVE"))
        #expect(
            memory.submission == .memory(MemoryCreate(content: "I prefer deep work before lunch.", sensitivity: .sensitive, keepUntil: nil))
        )
    }

    @Test func aDraftOfAnUnknownKindCannotBeSaved() {
        #expect(form(.unknown, ["title": .text("X")]).submission == nil)
    }

    @Test func everyFieldOfEveryKindHasALabel() {
        for kind in [DraftKind.task, .goal, .habit, .calendarEvent, .memory] {
            for field in DraftForm.specs(kind) {
                #expect(!field.label.hasPrefix("draft."), "\(kind).\(field.name)")
                if case .choice(let options) = field.input {
                    #expect(options.allSatisfy { !$0.label.hasPrefix("draft.") }, "\(kind).\(field.name)")
                }
            }
        }
    }

    @Test func serverFieldNamesMapOntoTheForm() {
        #expect(DraftForm.field(forServerField: "startAt") == "startTime")
        #expect(DraftForm.field(forServerField: "endAt") == "endTime")
        #expect(DraftForm.field(forServerField: "title") == "title")
    }
}
