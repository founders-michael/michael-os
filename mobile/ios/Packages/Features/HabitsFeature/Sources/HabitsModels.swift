import Foundation
import Models
import Observation
import Repositories

/// The habit list: active or archived, today's check-ins in flight, and Michael's line.
@MainActor
@Observable
final class HabitsModel {
    enum State: Equatable {
        case loading
        case content([Habit])
        case empty
        case failed(AppError)
    }

    private(set) var state = State.loading
    private(set) var showsArchived = false
    /// Today's check-in state each habit is moving to while its write is in flight.
    private(set) var pending: [Habit.ID: Bool] = [:]
    private(set) var rollbacks: [Habit.ID: AppError] = [:]
    private(set) var timeZone = "UTC"

    private let habits: any HabitRepository
    private let profiles: any ProfileRepository
    private var all: [Habit] = []

    init(habits: any HabitRepository, profiles: any ProfileRepository) {
        self.habits = habits
        self.profiles = profiles
    }

    /// Michael's line reads every active habit, whichever filter is shown.
    var line: HabitLine? { HabitLine(all) }

    var scheduledToday: Int { all.filter { $0.status == .active && $0.todayScheduled }.count }
    var completedToday: Int { all.filter { $0.status == .active && $0.todayScheduled && isDone($0) }.count }

    func habit(_ id: Habit.ID) -> Habit? { all.first { $0.id == id } }

    func isDone(_ habit: Habit) -> Bool { pending[habit.id] ?? habit.completedToday }

    func load() async {
        if case .failed = state { state = .loading }
        do {
            async let list = habits.list(nil)
            async let zone = profiles.profile()?.timeZone
            let (loaded, timeZone) = try await (list, zone)
            all = loaded
            self.timeZone = timeZone ?? "UTC"
            show()
        } catch is CancellationError {
            return
        } catch {
            if all.isEmpty { state = .failed(AppError(error)) }
        }
    }

    func show(archived: Bool) {
        showsArchived = archived
        show()
    }

    /// Checks in for today, or undoes today's check-in, on screen first.
    func toggle(_ id: Habit.ID) async {
        guard let habit = all.first(where: { $0.id == id }), habit.status == .active, pending[id] == nil else { return }
        let target = !habit.completedToday
        pending[id] = target
        rollbacks[id] = nil
        do {
            if target {
                _ = try await habits.checkIn(id, on: habit.today)
            } else if let checkIn = habit.checkIns.first(where: { $0.localDate == habit.today }) {
                do {
                    try await habits.undoCheckIn(id, checkInID: checkIn.id)
                } catch AppError.notFound {
                    // Undone elsewhere already.
                }
            }
            replace(try await habits.habit(id))
        } catch is CancellationError {
        } catch {
            rollbacks[id] = AppError(error)
        }
        pending[id] = nil
    }

    func replace(_ habit: Habit) {
        if let index = all.firstIndex(where: { $0.id == habit.id }) { all[index] = habit } else { all.insert(habit, at: 0) }
        show()
    }

    func remove(_ id: Habit.ID) {
        all.removeAll { $0.id == id }
        show()
    }

    private func show() {
        let shown = all.filter { $0.status == (showsArchived ? .archived : .active) }
        state = shown.isEmpty ? .empty : .content(Self.ordered(shown))
    }

    /// Scheduled today first, then the rest, each by name.
    static func ordered(_ habits: [Habit]) -> [Habit] {
        habits.sorted { left, right in
            if left.todayScheduled != right.todayScheduled { return left.todayScheduled }
            return left.title.localizedCaseInsensitiveCompare(right.title) == .orderedAscending
        }
    }
}

/// One habit: its stats, today's check-in, archive, reactivate and delete.
@MainActor
@Observable
final class HabitDetailModel {
    enum Action: Equatable {
        case checkIn, status, delete
    }

    private(set) var habit: Habit
    private(set) var busy: Action?
    private(set) var problem: AppError?
    private(set) var deleted = false

    private let habits: any HabitRepository

    init(habit: Habit, habits: any HabitRepository) {
        self.habit = habit
        self.habits = habits
    }

    func load() async {
        do {
            habit = try await habits.habit(habit.id)
        } catch AppError.notFound {
            deleted = true
        } catch {}
    }

    func toggleToday() async {
        await perform(.checkIn) {
            if self.habit.completedToday {
                if let checkIn = self.habit.checkIns.first(where: { $0.localDate == self.habit.today }) {
                    do {
                        try await self.habits.undoCheckIn(self.habit.id, checkInID: checkIn.id)
                    } catch AppError.notFound {}
                }
            } else {
                _ = try await self.habits.checkIn(self.habit.id, on: self.habit.today)
            }
            self.habit = try await self.habits.habit(self.habit.id)
        }
    }

    func setArchived(_ archived: Bool) async {
        await perform(.status) { self.habit = try await self.habits.setStatus(self.habit.id, archived ? .archived : .active) }
    }

    func delete() async {
        await perform(.delete) {
            do {
                try await self.habits.delete(self.habit.id)
            } catch AppError.notFound {}
            self.deleted = true
        }
    }

    func saved(_ habit: Habit) {
        self.habit = habit
    }

    private func perform(_ action: Action, _ work: () async throws -> Void) async {
        guard busy == nil else { return }
        busy = action
        problem = nil
        defer { busy = nil }
        do {
            try await work()
        } catch is CancellationError {
        } catch AppError.notFound {
            deleted = true
        } catch {
            problem = AppError(error)
        }
    }
}

/// The create and edit sheet. It says saved only once the server has returned the habit.
@MainActor
@Observable
final class HabitEditorModel {
    var form: HabitForm
    private(set) var saving = false
    private(set) var saved: Habit?
    private(set) var failure: AppError?
    private(set) var serverErrors: [String: String] = [:]
    private(set) var showsProblems = false

    let habit: Habit?
    private let original: HabitForm
    private let habits: any HabitRepository

    init(habit: Habit?, habits: any HabitRepository) {
        self.habit = habit
        self.habits = habits
        let form = habit.map(HabitForm.init) ?? HabitForm()
        self.form = form
        original = form
    }

    var hasChanges: Bool { form != original }

    func edit(_ change: (inout HabitForm) -> Void) {
        change(&form)
        form.title = String(form.title.prefix(HabitForm.titleLimit))
        form.notes = String(form.notes.prefix(HabitForm.notesLimit))
        serverErrors = [:]
        failure = nil
    }

    func save() async {
        guard !saving else { return }
        showsProblems = true
        guard let body = form.save else { return }
        saving = true
        defer { saving = false }
        do {
            saved = try await habits.save(body, to: habit?.id)
        } catch is CancellationError {
        } catch {
            let failure = AppError(error)
            if case .validation(_, let fields) = failure, !fields.isEmpty {
                serverErrors = fields.compactMapValues(\.first)
            } else {
                self.failure = failure
            }
        }
    }
}

extension AppError {
    init(_ error: any Error) {
        self = error as? AppError ?? .server(ServerMessage())
    }
}
