import Foundation
import Models
import Observation
import Repositories

/// The goal list: every goal, shown one status at a time, with the server's today.
@MainActor
@Observable
final class GoalsModel {
    enum State: Equatable {
        case loading
        case content([Goal])
        case empty
        case failed(AppError)
    }

    private(set) var state = State.loading
    private(set) var filter = GoalStatus.active
    private(set) var today: LocalDate?

    private let goals: any GoalRepository
    private var all: [Goal] = []

    init(goals: any GoalRepository) {
        self.goals = goals
    }

    func goal(_ id: Goal.ID) -> Goal? { all.first { $0.id == id } }

    func count(_ status: GoalStatus) -> Int { all.filter { $0.status == status }.count }

    func load() async {
        if case .failed = state { state = .loading }
        do {
            async let list = goals.list(nil)
            async let day = goals.today()
            (all, today) = try await (list, day)
            show()
        } catch is CancellationError {
            return
        } catch {
            if all.isEmpty { state = .failed(AppError(error)) }
        }
    }

    func show(_ status: GoalStatus) {
        filter = status
        show()
    }

    func replace(_ goal: Goal) {
        if let index = all.firstIndex(where: { $0.id == goal.id }) { all[index] = goal } else { all.insert(goal, at: 0) }
        show()
    }

    func remove(_ id: Goal.ID) {
        all.removeAll { $0.id == id }
        show()
    }

    private func show() {
        let shown = all.filter { $0.status == filter }
        state = shown.isEmpty ? .empty : .content(shown)
    }
}

/// One goal: status changes, manual progress and its milestones. Every change waits for the server and then reloads
/// the goal, because milestone calls answer with the bare row and the counts move with them. One change runs at a
/// time, so a move cannot race the save before it.
@MainActor
@Observable
final class GoalDetailModel {
    enum Action: Equatable {
        case status, progress, delete, milestone
    }

    private(set) var goal: Goal
    let today: LocalDate
    private(set) var busy: Action?
    private(set) var problem: AppError?
    private(set) var deleted = false
    /// A milestone check shown at once while its save is in flight.
    private(set) var pendingCheck: (id: GoalMilestone.ID, status: MilestoneStatus)?

    private let goals: any GoalRepository

    init(goal: Goal, today: LocalDate, goals: any GoalRepository) {
        self.goal = goal
        self.today = today
        self.goals = goals
    }

    var read: GoalRead? { goal.status == .active ? GoalRead(goal, today: today) : nil }

    var isWorkable: Bool { goal.status == .active && busy == nil }

    func isDone(_ milestone: GoalMilestone) -> Bool {
        if let pendingCheck, pendingCheck.id == milestone.id { return pendingCheck.status == .completed }
        return milestone.status == .completed
    }

    func load() async {
        do {
            goal = try await goals.goal(goal.id)
        } catch AppError.notFound {
            deleted = true
        } catch {}
    }

    func setStatus(_ status: GoalStatus) async {
        await perform(.status) { self.goal = try await self.goals.change(self.goal.id, .status(status)) }
    }

    func setProgress(_ progress: Int) async {
        guard goal.status == .active, progress != goal.progress else { return }
        await perform(.progress) { self.goal = try await self.goals.change(self.goal.id, .progress(progress)) }
    }

    func delete() async {
        await perform(.delete) {
            do {
                try await self.goals.delete(self.goal.id)
            } catch AppError.notFound {}
            self.deleted = true
        }
    }

    /// True once the server has the milestone, so the field can clear.
    func addMilestone(_ title: String) async -> Bool {
        let title = String(title.trimmingCharacters(in: .whitespacesAndNewlines).prefix(GoalForm.titleLimit))
        guard !title.isEmpty else { return false }
        var added = false
        await changeMilestones { goal in
            try await self.goals.addMilestone(to: goal, MilestoneCreate(title: title))
            added = true
        }
        return added
    }

    func rename(_ milestone: GoalMilestone, to title: String) async {
        let title = String(title.trimmingCharacters(in: .whitespacesAndNewlines).prefix(GoalForm.titleLimit))
        guard !title.isEmpty, title != milestone.title else { return }
        await changeMilestones { try await self.goals.change(milestone: milestone.id, of: $0, .title(title)) }
    }

    func toggle(_ milestone: GoalMilestone) async {
        let status: MilestoneStatus = milestone.status == .completed ? .pending : .completed
        guard isWorkable else { return }
        pendingCheck = (milestone.id, status)
        await changeMilestones { try await self.goals.change(milestone: milestone.id, of: $0, .status(status)) }
        pendingCheck = nil
    }

    /// Up is -1, down is +1. The server renumbers the others.
    func move(_ milestone: GoalMilestone, by offset: Int) async {
        guard let index = goal.milestones.firstIndex(where: { $0.id == milestone.id }),
            goal.milestones.indices.contains(index + offset)
        else { return }
        await changeMilestones { try await self.goals.change(milestone: milestone.id, of: $0, .position(index + offset)) }
    }

    func delete(_ milestone: GoalMilestone) async {
        await changeMilestones { goal in
            do {
                try await self.goals.delete(milestone: milestone.id, of: goal)
            } catch AppError.notFound {}
        }
    }

    func saved(_ goal: Goal) {
        self.goal = goal
    }

    private func changeMilestones(_ work: @escaping (Goal.ID) async throws -> Void) async {
        guard goal.status == .active else { return }
        await perform(.milestone) {
            try await work(self.goal.id)
            self.goal = try await self.goals.goal(self.goal.id)
        }
    }

    private func perform(_ action: Action, _ work: () async throws -> Void) async {
        guard busy == nil else { return }
        busy = action
        problem = nil
        defer { busy = nil }
        do {
            try await work()
        } catch is CancellationError {
        } catch AppError.notFound where action != .milestone {
            deleted = true
        } catch {
            problem = AppError(error)
            if action == .milestone { await load() }
        }
    }
}

/// The create and edit sheet. It says saved only once the server has returned the goal.
@MainActor
@Observable
final class GoalEditorModel {
    var form: GoalForm
    private(set) var saving = false
    private(set) var saved: Goal?
    private(set) var failure: AppError?
    private(set) var serverErrors: [String: String] = [:]
    private(set) var showsProblems = false

    let goal: Goal?
    private let original: GoalForm
    private let goals: any GoalRepository

    init(goal: Goal?, goals: any GoalRepository) {
        self.goal = goal
        self.goals = goals
        let form = goal.map(GoalForm.init) ?? GoalForm()
        self.form = form
        original = form
    }

    var hasChanges: Bool { form != original }

    func edit(_ change: (inout GoalForm) -> Void) {
        change(&form)
        form.title = String(form.title.prefix(GoalForm.titleLimit))
        form.notes = String(form.notes.prefix(GoalForm.notesLimit))
        form.category = String(form.category.prefix(GoalForm.categoryLimit))
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
            saved = try await goals.save(body, to: goal?.id)
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
