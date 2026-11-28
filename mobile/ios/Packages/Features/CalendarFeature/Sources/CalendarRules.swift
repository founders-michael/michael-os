import Foundation
import Models

/// Wall-clock dates and times in the profile's zone, and the instants they name. Calendar works in instants; every
/// date and time it shows or takes is on this clock, never the device's.
struct ZonedClock: Equatable {
    let zone: String
    private let calendar: Calendar

    init(zone: String) {
        self.zone = zone
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: zone) ?? .current
        self.calendar = calendar
    }

    static func == (lhs: ZonedClock, rhs: ZonedClock) -> Bool { lhs.zone == rhs.zone }

    var timeZone: TimeZone { calendar.timeZone }

    /// In a daylight-saving gap the clock moves forward, as the server's does.
    func instant(_ date: LocalDate, _ time: LocalTime = LocalTime(hour: 0, minute: 0)) -> Date {
        let parts = DateComponents(year: date.year, month: date.month, day: date.day, hour: time.hour, minute: time.minute)
        return calendar.date(from: parts) ?? .now
    }

    func date(of instant: Date) -> LocalDate {
        let parts = calendar.dateComponents([.year, .month, .day], from: instant)
        return LocalDate(String(format: "%04d-%02d-%02d", parts.year ?? 2000, parts.month ?? 1, parts.day ?? 1))
            ?? PickerClock.today(in: zone)
    }

    func time(of instant: Date) -> LocalTime {
        let parts = calendar.dateComponents([.hour, .minute], from: instant)
        return LocalTime(hour: parts.hour ?? 0, minute: parts.minute ?? 0)
    }

    func minuteOfDay(_ instant: Date) -> Int {
        let time = time(of: instant)
        return time.hour * 60 + time.minute
    }

    func today(_ now: Date = .now) -> LocalDate { date(of: now) }
}

/// Monday to Sunday around one date: what the screen loads in one call and the week strip shows.
struct CalendarWeek: Equatable {
    let monday: LocalDate

    init(containing date: LocalDate) {
        monday = date.adding(days: 1 - date.weekday)
    }

    var days: [LocalDate] { (0..<7).map { monday.adding(days: $0) } }

    func contains(_ date: LocalDate) -> Bool { date >= monday && date < monday.adding(days: 7) }

    func shifted(by weeks: Int) -> CalendarWeek { CalendarWeek(containing: monday.adding(days: 7 * weeks)) }

    func range(on clock: ZonedClock) -> (start: Date, end: Date) {
        (clock.instant(monday), clock.instant(monday.adding(days: 7)))
    }
}

protocol Timed {
    var startAt: Date { get }
    var endAt: Date { get }
}

extension CalendarEvent: Timed {}
extension ProposedSession: Timed {}

/// Where one item sits in a day's grid, in wall-clock minutes (0 is midnight, 1,440 the next midnight).
struct PlacedItem<Item> {
    let item: Item
    let startMinute: Int
    let endMinute: Int
    let continuesBefore: Bool
    let continuesAfter: Bool
    var column = 0
    var columns = 1
}

/// The web's `layoutDayEvents` (`src/lib/calendar-day-layout.ts`). An item that began the day before starts at 0, one
/// that runs into the next day ends at 1,440, none is drawn shorter than 30 minutes, and items that overlap share the
/// width, each in the first free column of its group.
enum DayLayout {
    static let minutesPerDay = 1440
    static let shortestDrawn = 30

    static func place<Item: Timed>(_ items: [Item], on day: LocalDate, clock: ZonedClock) -> [PlacedItem<Item>] {
        let dayStart = clock.instant(day)
        let dayEnd = clock.instant(day.adding(days: 1))
        var placed = items.filter { $0.startAt < dayEnd && $0.endAt > dayStart }.map { item in
            let before = item.startAt < dayStart
            let after = item.endAt > dayEnd
            let start = before ? 0 : clock.minuteOfDay(item.startAt)
            var end = after || item.endAt == dayEnd ? minutesPerDay : clock.minuteOfDay(item.endAt)
            if end <= start { end = minutesPerDay }
            end = min(minutesPerDay, max(end, start + shortestDrawn))
            return PlacedItem(item: item, startMinute: start, endMinute: end, continuesBefore: before, continuesAfter: after)
        }
        .sorted { ($0.startMinute, -$0.endMinute) < ($1.startMinute, -$1.endMinute) }

        var group: [Int] = []
        var groupEnd = -1
        func close() {
            let columns = max(1, (group.map { placed[$0].column + 1 }.max() ?? 1))
            for index in group { placed[index].columns = columns }
            group = []
        }
        for index in placed.indices {
            if placed[index].startMinute >= groupEnd {
                close()
                groupEnd = -1
            }
            let busy = Set(group.filter { placed[$0].endMinute > placed[index].startMinute }.map { placed[$0].column })
            var column = 0
            while busy.contains(column) { column += 1 }
            placed[index].column = column
            group.append(index)
            groupEnd = max(groupEnd, placed[index].endMinute)
        }
        close()
        return placed
    }

    /// An hour before the first item, never later than 8 AM.
    static func firstMinute(_ placed: [Int]) -> Int {
        max(0, min(8 * 60, placed.min() ?? 8 * 60) - 60)
    }
}

enum EventKind: CaseIterable, Equatable {
    case commitment, unavailable, session

    init(_ type: CalendarEventType) {
        switch type {
        case .taskSession: self = .session
        case .unavailable: self = .unavailable
        case .commitment, .unknown: self = .commitment
        }
    }

    var type: CalendarEventType {
        switch self {
        case .commitment: .commitment
        case .unavailable: .unavailable
        case .session: .taskSession
        }
    }
}

/// The event editor's fields. An end earlier than the start means the next day; an end equal to it is refused.
struct EventForm: Equatable {
    static let titleLimit = 160
    static let notesLimit = 5000

    enum Problem: Equatable { case titleMissing, noLength }

    var title = ""
    var notes = ""
    var kind = EventKind.commitment
    var date: LocalDate
    var start: LocalTime {
        didSet { endDays = end < start ? 1 : 0 }
    }
    var end: LocalTime {
        didSet { endDays = end < start ? 1 : 0 }
    }
    var taskId: String?
    var taskTitle: String?
    /// Days from the start's date to the end's. Set from the times as they change; an event from the web that
    /// spans more days keeps its span until a time is changed.
    private(set) var endDays = 0

    /// A new event on `date`: the next whole hour today, otherwise 09:00, for `minutes`.
    init(on date: LocalDate, clock: ZonedClock, now: Date = .now, minutes: Int = 60) {
        self.date = date
        let first: LocalTime
        if date == clock.today(now) {
            let time = clock.time(of: now)
            first = LocalTime(hour: min(time.hour + 1, 23), minute: 0)
        } else {
            first = LocalTime(hour: 9, minute: 0)
        }
        start = first
        end = LocalTime(hour: first.hour, minute: first.minute + minutes)
        endDays = end < start || minutes >= 24 * 60 ? 1 : 0
    }

    /// A focus session for one task, as long as its estimate.
    init(scheduling task: UnscheduledTask, on date: LocalDate, clock: ZonedClock, now: Date = .now) {
        self.init(on: date, clock: clock, now: now, minutes: task.estimatedDurationMinutes ?? 60)
        title = String(task.title.prefix(Self.titleLimit))
        kind = .session
        taskId = task.id
        taskTitle = task.title
    }

    init(_ event: CalendarEvent, clock: ZonedClock) {
        title = event.title
        notes = event.description ?? ""
        kind = EventKind(event.eventType)
        date = clock.date(of: event.startAt)
        start = clock.time(of: event.startAt)
        end = clock.time(of: event.endAt)
        taskId = event.taskId
        taskTitle = event.taskTitle
        let endDate = clock.date(of: event.endAt)
        var days = 0
        while date.adding(days: days) < endDate { days += 1 }
        endDays = days
    }

    var endsNextDay: Bool { endDays > 0 }

    var problems: [Problem] {
        var problems: [Problem] = []
        if title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { problems.append(.titleMissing) }
        if endDays == 0 && end == start { problems.append(.noLength) }
        return problems
    }

    func interval(on clock: ZonedClock) -> (start: Date, end: Date) {
        (clock.instant(date, start), clock.instant(date.adding(days: endDays), end))
    }

    private var trimmedNotes: String? {
        let notes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        return notes.isEmpty ? nil : notes
    }

    func create(on clock: ZonedClock) -> CalendarEventCreate? {
        guard problems.isEmpty else { return nil }
        let interval = interval(on: clock)
        return CalendarEventCreate(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines), description: trimmedNotes, eventType: kind.type,
            taskId: kind == .session ? taskId : nil, startAt: interval.start, endAt: interval.end, timeZone: clock.zone
        )
    }

    func update(on clock: ZonedClock) -> CalendarEventUpdate? {
        guard problems.isEmpty else { return nil }
        let interval = interval(on: clock)
        return CalendarEventUpdate(
            title: title.trimmingCharacters(in: .whitespacesAndNewlines), description: trimmedNotes, taskId: taskId,
            startAt: interval.start, endAt: interval.end, timeZone: clock.zone, sendsTask: kind == .session
        )
    }
}

/// The dates a plan covers: from today or later, up to seven dates.
struct PlanRange: Equatable {
    static let longest = 7

    var first: LocalDate {
        didSet { if last < first || last > latestLast { last = first.adding(days: 2) } }
    }
    var last: LocalDate

    init(first: LocalDate) {
        self.first = first
        last = first.adding(days: 2)
    }

    func isValid(today: LocalDate) -> Bool { first >= today && last >= first && last <= latestLast }

    var latestLast: LocalDate { first.adding(days: Self.longest - 1) }

    var request: PlanRequest { PlanRequest(fromDate: first, toDate: last) }
}

/// A proposal under review and the sessions the user keeps, all of them to start. Held in memory only, with its token.
struct PlanReview: Equatable {
    let proposal: PlanningProposal
    private(set) var kept: Set<String>

    init(_ proposal: PlanningProposal) {
        self.proposal = proposal
        kept = Set(proposal.proposedActivities.map(\.selectionId))
    }

    var sessions: [ProposedSession] { proposal.proposedActivities.sorted { $0.startAt < $1.startAt } }

    var keptCount: Int { kept.count }

    func isKept(_ session: ProposedSession) -> Bool { kept.contains(session.selectionId) }

    mutating func toggle(_ session: ProposedSession) {
        if kept.contains(session.selectionId) { kept.remove(session.selectionId) } else { kept.insert(session.selectionId) }
    }

    func title(_ taskId: String) -> String? { proposal.taskDetails.first { $0.id == taskId }?.title }

    func isExpired(_ now: Date = .now) -> Bool { now >= proposal.approvalExpiresAt }

    /// "Title: reason" for each task the planner could not place, the title left out when it has none.
    var notPlaced: [(title: String?, reason: String)] {
        proposal.unscheduledTasks.map { (title($0.taskId), $0.reason) }
    }

    var needsAvailability: Bool { proposal.warnings.contains { $0.code == Self.noAvailability } }

    /// The planner's other notes, as it wrote them.
    var notes: [String] { proposal.warnings.filter { $0.code != Self.noAvailability }.map(\.message) }

    var apply: PlanApply? {
        guard !kept.isEmpty else { return nil }
        return PlanApply(approvalToken: proposal.approvalToken, selectedSessionIds: sessions.map(\.selectionId).filter(kept.contains))
    }

    private static let noAvailability = "AVAILABILITY_UNCONFIGURED"
}

/// What a failed plan request or apply means for the user.
enum PlanProblem: Equatable {
    /// The proposal no longer matches the calendar, tasks, availability or zone; nothing was applied.
    case stale(String?)
    /// The planner refused the request as asked, such as no fit or a range it does not take.
    case refused(String?)
    /// The planner or the network is down; trying again may work.
    case unavailable(AppError)

    init(_ error: AppError) {
        switch error {
        case .conflict(let server), .validation(let server, _), .notFound(let server):
            if let code = server.code, Self.staleCodes.contains(code) {
                self = .stale(server.text)
            } else {
                self = .refused(server.text)
            }
        default:
            self = .unavailable(error)
        }
    }

    private static let staleCodes: Set<String> = [
        "PROPOSAL_EXPIRED", "PROPOSAL_USED", "CALENDAR_CHANGED", "STALE_TASKS", "AVAILABILITY_CHANGED", "TIMEZONE_CHANGED",
        "INVALID_SELECTION", "INVALID_PROPOSAL",
    ]
}
