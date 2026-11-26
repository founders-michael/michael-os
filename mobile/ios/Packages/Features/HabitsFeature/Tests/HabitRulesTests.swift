import Foundation
import Models
import TestSupport
import Testing

@testable import HabitsFeature

struct HabitRulesTests {
    private func habits() throws -> [Habit] {
        try JSONDecoder.api().decode(HabitList.self, from: try ContractExamples.example("habits-list.json")).habits
    }

    private func with(_ habit: Habit, streak: Int, best: Int, scheduled: Bool = true, done: Bool = false) -> Habit {
        var copy = habit
        copy.currentStreak = streak
        copy.bestStreak = best
        copy.todayScheduled = scheduled
        copy.completedToday = done
        copy.status = .active
        return copy
    }

    @Test func michaelsLinePicksTheDueHabitWithTheLongestStreak() throws {
        let base = try #require(try habits().first)
        var short = with(base, streak: 2, best: 9)
        short.id = "short"
        var long = with(base, streak: 6, best: 6)
        long.id = "long"
        let line = try #require(HabitLine([short, long]))
        #expect(line.kind == .next(long))
        #expect(HabitLine.record(long) == .best)
        #expect(HabitLine.record(with(base, streak: 4, best: 5)) == .matchesBest)
        #expect(HabitLine.record(with(base, streak: 1, best: 5)) == HabitLine.Record.none)
    }

    @Test func michaelsLineWhenNothingIsDue() throws {
        let base = try #require(try habits().first)
        #expect(HabitLine([with(base, streak: 3, best: 3, done: true)])?.kind == .allDone)
        #expect(HabitLine([with(base, streak: 3, best: 3, scheduled: false)])?.kind == .nothingToday)
        var archived = base
        archived.status = .archived
        #expect(HabitLine([archived]) == nil)
    }

    @Test func theScheduleRulesMatchTheServer() {
        var schedule = HabitSchedule(frequency: .selectedDays)
        #expect(schedule.problem == .noWeekday)
        schedule.weekdays = [1]
        schedule.endTime = LocalTime(hour: 7, minute: 0)
        #expect(schedule.problem == .endWithoutStart)
        schedule.startTime = LocalTime(hour: 7, minute: 0)
        #expect(schedule.problem == .endEqualsStart)
        schedule.startTime = LocalTime(hour: 23, minute: 0)
        #expect(schedule.problem == nil)
        #expect(schedule.runsPastMidnight)
    }

    @Test func aDailyHabitSendsNoWeekdays() {
        var form = HabitForm()
        form.title = " Read 20 pages "
        form.schedule.weekdays = [3]
        #expect(
            form.save == HabitSave(title: "Read 20 pages", description: nil, frequency: .daily, weekdays: [], startTime: nil, endTime: nil))
    }
}
