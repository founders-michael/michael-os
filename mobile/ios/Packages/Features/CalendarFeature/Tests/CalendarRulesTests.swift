import Foundation
import Models
import TestSupport
import Testing

@testable import CalendarFeature

struct CalendarRulesTests {
    private let auckland = ZonedClock(zone: "Pacific/Auckland")
    private let day = LocalDate("2026-11-30") ?? PickerClock.today(in: "UTC")

    private func event(_ id: String, _ start: String, _ end: String) -> CalendarEvent {
        let style = Date.ISO8601FormatStyle()
        return CalendarEvent(
            id: id, eventType: .commitment, title: id, startAt: (try? style.parse(start)) ?? .distantPast,
            endAt: (try? style.parse(end)) ?? .distantPast, timeZone: "Pacific/Auckland")
    }

    @Test func eventsSitOnTheProfileClockAndOverlapsShareTheWidth() {
        let events = [
            event("standup", "2026-11-29T20:00:00Z", "2026-11-29T21:00:00Z"),
            event("review", "2026-11-29T20:30:00Z", "2026-11-29T21:30:00Z"),
            event("ping", "2026-11-29T22:00:00Z", "2026-11-29T22:10:00Z"),
            event("train", "2026-11-30T10:00:00Z", "2026-11-30T12:30:00Z"),
        ]
        let placed = DayLayout.place(events, on: day, clock: auckland)
        let byId = Dictionary(uniqueKeysWithValues: placed.map { ($0.item.id, $0) })
        #expect(byId["standup"]?.startMinute == 9 * 60)
        #expect(byId["standup"]?.columns == 2 && byId["review"]?.column == 1)
        #expect(byId["ping"]?.columns == 1 && byId["ping"]?.endMinute == 11 * 60 + 30)
        #expect(byId["train"]?.endMinute == DayLayout.minutesPerDay && byId["train"]?.continuesAfter == true)
        let nextDay = DayLayout.place(events, on: day.adding(days: 1), clock: auckland)
        #expect(nextDay.map(\.item.id) == ["train"] && nextDay.first?.startMinute == 0 && nextDay.first?.endMinute == 90)
        let kolkata = DayLayout.place(events, on: day, clock: ZonedClock(zone: "Asia/Kolkata"))
        #expect(kolkata.first { $0.item.id == "standup" }?.startMinute == 90)
    }

    @Test func anEndBeforeTheStartIsTheNextDayAndAnEqualOneIsRefused() throws {
        var form = EventForm(on: day, clock: auckland, now: auckland.instant(day.adding(days: -1)))
        form.title = "Night train"
        form.kind = .unavailable
        form.taskId = "task"
        form.start = LocalTime(hour: 23, minute: 0)
        form.end = LocalTime(hour: 1, minute: 30)
        #expect(form.endsNextDay)
        let body = try #require(form.create(on: auckland))
        #expect(body.taskId == nil && body.endAt.timeIntervalSince(body.startAt) == 150 * 60)
        #expect(auckland.date(of: body.endAt) == day.adding(days: 1))
        form.end = form.start
        #expect(form.problems == [.noLength] && form.create(on: auckland) == nil)

        let listed = try JSONDecoder.api().decode(CalendarEventsPage.self, from: try ContractExamples.example("calendar-events-list.json"))
        let train = try #require(listed.events.first { $0.title == "Night train" })
        let edited = EventForm(train, clock: auckland)
        #expect(edited.endsNextDay && edited.interval(on: auckland) == (train.startAt, train.endAt))
        let session = try #require(listed.events.first { $0.eventType == .taskSession })
        let change = try #require(EventForm(session, clock: auckland).update(on: auckland))
        let json = try #require(String(bytes: try JSONEncoder.api().encode(change), encoding: .utf8))
        #expect(json.contains("\"taskId\":\"\(session.taskId ?? "")\"") && !json.contains("eventType"))
    }

    @Test func aPlanAppliesOnlyWhatIsKeptAndAStaleOneAsksForANewPlan() throws {
        let proposal = try JSONDecoder.api().decode(PlanningProposalResponse.self, from: try ContractExamples.example("calendar-plan.json"))
            .proposal
        var review = PlanReview(proposal)
        let session = try #require(review.sessions.first)
        #expect(review.keptCount == 1 && review.title(session.taskId) == "Draft the quarterly letter")
        #expect(review.notes.count == 2 && !review.needsAvailability)
        review.toggle(session)
        #expect(review.apply == nil)
        review.toggle(session)
        #expect(review.apply?.selectedSessionIds == [session.selectionId])
        #expect(review.isExpired(proposal.approvalExpiresAt) && !review.isExpired(proposal.approvalExpiresAt.addingTimeInterval(-1)))

        #expect(PlanProblem(.conflict(ServerMessage(text: "Used.", code: "PROPOSAL_USED"))) == .stale("Used."))
        #expect(PlanProblem(.validation(ServerMessage(text: "Expired.", code: "PROPOSAL_EXPIRED"), fields: [:])) == .stale("Expired."))
        #expect(PlanProblem(.validation(ServerMessage(text: "Too long.", code: "INVALID_HORIZON"), fields: [:])) == .refused("Too long."))
        #expect(PlanProblem(.server(ServerMessage(code: "SOLVER_FAILURE"))) == .unavailable(.server(ServerMessage(code: "SOLVER_FAILURE"))))

        var range = PlanRange(first: day)
        #expect(range.isValid(today: day) && !range.isValid(today: day.adding(days: 1)))
        range.last = day.adding(days: 8)
        #expect(!range.isValid(today: day))
        range.first = day.adding(days: 1)
        #expect(range.last == day.adding(days: 3))
    }
}
