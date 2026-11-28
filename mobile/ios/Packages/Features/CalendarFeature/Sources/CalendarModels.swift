import Foundation
import Models
import Observation
import Repositories

/// The day view: the week around the chosen day in the profile zone, the tasks without a time, and a plan under
/// review. The plan and its token live only here, in memory.
@MainActor
@Observable
final class CalendarModel {
    enum State: Equatable {
        case loading
        case content
        case failed(AppError)
    }

    private(set) var state = State.loading
    private(set) var clock: ZonedClock?
    private(set) var day: LocalDate?
    private(set) var events: [CalendarEvent] = []
    private(set) var truncated = false
    private(set) var availabilityConfigured = true
    private(set) var unscheduled: [UnscheduledTask] = []
    var review: PlanReview?

    private let calendar: any CalendarRepository
    private var loadedWeek: CalendarWeek?

    init(calendar: any CalendarRepository) {
        self.calendar = calendar
    }

    var week: CalendarWeek? { day.map(CalendarWeek.init(containing:)) }

    var today: LocalDate? { clock?.today() }

    func load() async {
        if case .failed = state { state = .loading }
        do {
            let availability = try await calendar.availability()
            let clock = ZonedClock(zone: availability.timeZone)
            self.clock = clock
            availabilityConfigured = availability.configured
            let day = day ?? clock.today()
            async let tasks = calendar.unscheduledTasks()
            try await loadWeek(CalendarWeek(containing: day), clock: clock)
            self.day = day
            unscheduled = (try? await tasks) ?? unscheduled
            state = .content
        } catch is CancellationError {
            return
        } catch {
            if clock == nil || loadedWeek == nil { state = .failed(AppError(error)) }
        }
    }

    func show(_ date: LocalDate) async {
        guard let clock else { return }
        let week = CalendarWeek(containing: date)
        day = date
        guard week != loadedWeek else { return }
        do {
            try await loadWeek(week, clock: clock)
        } catch is CancellationError {
        } catch {
            state = .failed(AppError(error))
        }
    }

    func reload() async {
        guard let clock, let week else { return await load() }
        try? await loadWeek(week, clock: clock)
        if let tasks = try? await calendar.unscheduledTasks() { unscheduled = tasks }
    }

    /// The chat's plan, shown on the day of its first session.
    func startReview(_ proposal: PlanningProposal) async {
        review = PlanReview(proposal)
        if let first = review?.sessions.first, let clock { await show(clock.date(of: first.startAt)) }
    }

    private func loadWeek(_ week: CalendarWeek, clock: ZonedClock) async throws {
        let range = week.range(on: clock)
        let page = try await calendar.events(from: range.start, until: range.end)
        events = page.events
        truncated = page.truncated
        loadedWeek = week
    }
}

/// Create or edit one event. It says saved only once the server has the event; an overlap shows what it overlaps.
@MainActor
@Observable
final class EventEditorModel {
    var form: EventForm {
        didSet {
            if form.title.count > EventForm.titleLimit { form.title = String(form.title.prefix(EventForm.titleLimit)) }
            if form.notes.count > EventForm.notesLimit { form.notes = String(form.notes.prefix(EventForm.notesLimit)) }
            if form != oldValue {
                failure = nil
                conflicts = []
                serverErrors = [:]
            }
        }
    }
    private(set) var busy = false
    private(set) var done = false
    private(set) var failure: AppError?
    private(set) var conflicts: [CalendarConflict] = []
    private(set) var serverErrors: [String: String] = [:]
    private(set) var showsProblems = false

    let event: CalendarEvent?
    let clock: ZonedClock
    let tasks: [UnscheduledTask]
    private let original: EventForm
    private let calendar: any CalendarRepository

    init(form: EventForm, event: CalendarEvent?, clock: ZonedClock, tasks: [UnscheduledTask], calendar: any CalendarRepository) {
        self.form = form
        original = form
        self.event = event
        self.clock = clock
        self.tasks = tasks
        self.calendar = calendar
    }

    var hasChanges: Bool { form != original }

    func save() async {
        guard !busy else { return }
        showsProblems = true
        busy = true
        defer { busy = false }
        do {
            if let event {
                guard let change = form.update(on: clock) else { return }
                _ = try await calendar.update(event.id, change)
            } else {
                guard let body = form.create(on: clock) else { return }
                _ = try await calendar.create(body)
            }
            done = true
        } catch is CancellationError {
        } catch {
            show(AppError(error))
        }
    }

    func delete() async {
        guard let event, !busy else { return }
        busy = true
        defer { busy = false }
        do {
            try await calendar.delete(event: event.id)
            done = true
        } catch AppError.notFound {
            done = true
        } catch is CancellationError {
        } catch {
            show(AppError(error))
        }
    }

    private func show(_ error: AppError) {
        switch error {
        case .conflict(let server) where !server.conflicts.isEmpty:
            conflicts = server.conflicts
        case .validation(_, let fields) where !fields.isEmpty:
            serverErrors = fields.compactMapValues(\.first)
            failure = error
        default:
            failure = error
        }
    }
}

/// The plan sheet: choose dates, ask the planner, then apply the kept sessions of the review the day view also shows.
@MainActor
@Observable
final class PlanModel {
    enum Step: Equatable {
        case choosing
        case asking
        case reviewing
        case applying
        case applied(Int)
        case failed(PlanProblem)
    }

    private(set) var step: Step
    var range: PlanRange
    let today: LocalDate
    let clock: ZonedClock

    private let calendar: any CalendarRepository
    private let owner: CalendarModel

    init(owner: CalendarModel, clock: ZonedClock, calendar: any CalendarRepository) {
        self.owner = owner
        self.clock = clock
        self.calendar = calendar
        today = clock.today()
        range = PlanRange(first: max(owner.day ?? today, today))
        step = owner.review == nil ? .choosing : .reviewing
    }

    var review: PlanReview? { owner.review }

    func toggle(_ session: ProposedSession) {
        owner.review?.toggle(session)
    }

    func ask() async {
        guard range.isValid(today: today), step != .asking else { return }
        step = .asking
        do {
            let proposal = try await calendar.plan(range.request)
            await owner.startReview(proposal)
            step = .reviewing
        } catch is CancellationError {
            step = .choosing
        } catch {
            step = .failed(PlanProblem(AppError(error)))
        }
    }

    func apply() async {
        guard let review = owner.review, step == .reviewing else { return }
        guard !review.isExpired() else {
            step = .failed(.stale(nil))
            owner.review = nil
            return
        }
        guard let body = review.apply else { return }
        step = .applying
        do {
            let result = try await calendar.apply(body)
            owner.review = nil
            step = .applied(result.createdCount)
            await owner.reload()
        } catch is CancellationError {
            step = .reviewing
        } catch {
            let problem = PlanProblem(AppError(error))
            if case .stale = problem { owner.review = nil }
            step = .failed(problem)
        }
    }

    func retryApply() async {
        guard owner.review != nil else { return await ask() }
        step = .reviewing
        await apply()
    }

    /// Back to the dates, dropping the review and its token.
    func startOver() {
        owner.review = nil
        step = .choosing
    }
}

extension AppError {
    init(_ error: any Error) {
        self = error as? AppError ?? .server(ServerMessage())
    }
}
