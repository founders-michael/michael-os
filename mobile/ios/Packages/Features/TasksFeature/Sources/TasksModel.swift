import Foundation
import Models
import Observation
import Repositories

/// What the task list shows: the loaded pages for the current filters, the counts, and every write in flight.
struct TaskList: Equatable {
    var query: TaskQuery
    var tasks: [Task]
    var pages: Int
    var total: Int
    var summary: TaskSummary?
    var timeZone: String
    var loadedAt: Date
    var isRefreshing = false
    var isLoadingMore = false
    /// A later page failed; the earlier ones stay on screen.
    var moreProblem: AppError?
    var refreshProblem: AppError?
    /// The status each row is moving to while its write is in flight: the user's latest choice.
    var pending: [Task.ID: TaskStatus] = [:]
    var rollbacks: [Task.ID: TaskRollback] = [:]
    /// Each task's place in Michael's order, while the list shows it.
    var ranking: [Task.ID: RankedTask] = [:]

    var canLoadMore: Bool { query.page < pages && !isLoadingMore }

    func status(of task: Task) -> TaskStatus { pending[task.id] ?? task.status }

    mutating func apply(_ saved: Task) {
        if let index = tasks.firstIndex(where: { $0.id == saved.id }) { tasks[index] = saved }
    }
}

struct TaskRollback: Equatable {
    let completing: Bool
    let error: AppError
}

@MainActor
@Observable
final class TasksModel {
    enum State: Equatable {
        case loading
        case content(TaskList)
        /// Nothing matches the filters; the wording depends on them.
        case empty(TaskList)
        case failed(AppError)
    }

    private(set) var state: State = .loading
    private(set) var query = TaskQuery()
    /// What is typed in the search field; the list follows it after a pause.
    private(set) var searchText = ""

    static let staleAfter: TimeInterval = 60
    static let searchPause: Duration = .milliseconds(300)

    private let tasks: any TaskRepository
    private let intelligence: any TaskIntelligenceRepository
    private let profiles: any ProfileRepository
    private let now: () -> Date
    private let searchPause: Duration
    private var timeZone: String?
    private var readGeneration = 0
    private var readTask: _Concurrency.Task<Void, Never>?
    private var searchTask: _Concurrency.Task<Void, Never>?
    private var writes: Set<Task.ID> = []
    private var seenVersion: Int?

    init(
        tasks: any TaskRepository,
        intelligence: any TaskIntelligenceRepository,
        profiles: any ProfileRepository,
        now: @escaping () -> Date = Date.init,
        searchPause: Duration = TasksModel.searchPause
    ) {
        self.tasks = tasks
        self.intelligence = intelligence
        self.profiles = profiles
        self.now = now
        self.searchPause = searchPause
    }

    var list: TaskList? {
        switch state {
        case .content(let list), .empty(let list): list
        case .loading, .failed: nil
        }
    }

    /// The screen appeared, the app returned to the foreground, or another screen changed a task (`version`).
    func appear(version: Int = 0) async {
        defer { seenVersion = version }
        switch state {
        case .loading, .failed:
            await load()
        case .content(let list), .empty(let list):
            if seenVersion != version || now().timeIntervalSince(list.loadedAt) >= Self.staleAfter {
                await refresh()
            }
        }
    }

    /// A first load, or a retry with nothing on screen.
    func load() async {
        state = .loading
        await read(query, replacing: true)
    }

    /// Reloads the first page over what is shown. A failure keeps the list and says why.
    func refresh() async {
        guard list != nil else { return await load() }
        update { $0.isRefreshing = true }
        await read(query, replacing: true)
    }

    func select(view: TaskView) { change { $0.view = view } }

    func select(priority: TaskPriority?) { change { $0.priority = priority } }

    func select(sort: TaskSort) { change { $0.sort = sort } }

    /// Typing: the request waits for a pause and replaces any search still in flight.
    func search(_ text: String) {
        searchText = text
        searchTask?.cancel()
        searchTask = _Concurrency.Task { [weak self, searchPause] in
            try? await _Concurrency.Task.sleep(for: searchPause)
            guard !_Concurrency.Task.isCancelled else { return }
            self?.change { $0.search = text }
        }
    }

    func loadMore() async {
        guard let list, list.canLoadMore else { return }
        update {
            $0.isLoadingMore = true
            $0.moreProblem = nil
        }
        var next = list.query
        next.page += 1
        await read(next, replacing: false)
    }

    /// Completes an open task or reopens a completed one, on screen first. Taps while a write is in flight change the
    /// target; the row ends in the state chosen last.
    func toggle(_ id: Task.ID) async {
        guard let list, let task = list.tasks.first(where: { $0.id == id }) else { return }
        let target: TaskStatus = list.status(of: task) == .completed ? .todo : .completed
        await setStatus(target, of: id)
    }

    func setStatus(_ target: TaskStatus, of id: Task.ID) async {
        update {
            $0.pending[id] = target
            $0.rollbacks[id] = nil
        }
        guard !writes.contains(id) else { return }
        writes.insert(id)
        defer { writes.remove(id) }
        var sent = target
        var spawned = false
        while true {
            do {
                let saved = try await tasks.update(id, TaskUpdate(status: sent))
                spawned = spawned || (saved.status == .completed && saved.activeRecurrence != nil)
                let wanted = list?.pending[id]
                update { $0.apply(saved) }
                guard let wanted, wanted != saved.status else {
                    update { $0.pending[id] = nil }
                    break
                }
                sent = wanted
            } catch is CancellationError {
                update { $0.pending[id] = nil }
                return
            } catch {
                if let wanted = list?.pending[id], wanted != sent {
                    sent = wanted
                    continue
                }
                update { list in
                    list.pending[id] = nil
                    list.rollbacks[id] = TaskRollback(completing: sent == .completed, error: AppError(error))
                }
                return
            }
        }
        // Completing a repeating task creates its next occurrence on the server; the list reloads to show it.
        if spawned { await refresh() } else { await refreshSummary() }
    }

    /// A task saved or changed on another screen of this tab.
    func saved(_ task: Task) {
        update { $0.apply(task) }
        _Concurrency.Task { await refresh() }
    }

    func removed(_ id: Task.ID) {
        update { list in
            list.tasks.removeAll { $0.id == id }
            list.total = max(0, list.total - 1)
        }
        _Concurrency.Task { await refreshSummary() }
    }

    func created(_ task: Task) {
        _Concurrency.Task { await refresh() }
    }

    private func change(_ edit: (inout TaskQuery) -> Void) {
        var next = query
        edit(&next)
        next.page = 1
        guard next != query else { return }
        query = next
        readTask?.cancel()
        if list == nil {
            state = .loading
        } else {
            update { $0.isRefreshing = true }
        }
        readTask = _Concurrency.Task { [weak self] in await self?.read(next, replacing: true) }
    }

    private func read(_ query: TaskQuery, replacing: Bool) async {
        readGeneration += 1
        let generation = readGeneration
        do {
            async let reading = page(query)
            async let summary = try? tasks.summary()
            async let zone = resolvedTimeZone()
            let ((loaded, ranking), counts, timeZone) = try await (reading, summary, zone)
            guard generation == readGeneration else { return }
            apply(Reading(page: loaded, ranking: ranking, counts: counts, timeZone: timeZone), query: query, replacing: replacing)
        } catch is CancellationError {
            if generation == readGeneration {
                update {
                    $0.isRefreshing = false
                    $0.isLoadingMore = false
                }
            }
        } catch {
            guard generation == readGeneration else { return }
            let failure = AppError(error)
            if list == nil {
                state = .failed(failure)
            } else if replacing {
                update {
                    $0.isRefreshing = false
                    $0.refreshProblem = failure
                }
            } else {
                update {
                    $0.isLoadingMore = false
                    $0.moreProblem = failure
                }
            }
        }
    }

    /// What one read brought back.
    private struct Reading {
        let page: TaskPage
        let ranking: [Task.ID: RankedTask]
        let counts: TaskSummary?
        let timeZone: String
    }

    private func apply(_ reading: Reading, query: TaskQuery, replacing: Bool) {
        let (loaded, ranking, counts, timeZone) = (reading.page, reading.ranking, reading.counts, reading.timeZone)
        if replacing {
            var fresh = TaskList(
                query: query, tasks: loaded.tasks, pages: loaded.pages, total: loaded.total, summary: counts ?? list?.summary,
                timeZone: timeZone, loadedAt: now()
            )
            fresh.pending = list?.pending ?? [:]
            fresh.ranking = ranking
            show(fresh)
        } else {
            update { list in
                let known = Set(list.tasks.map(\.id))
                list.tasks += loaded.tasks.filter { !known.contains($0.id) }
                list.query = query
                list.pages = loaded.pages
                list.total = loaded.total
                list.isLoadingMore = false
                list.ranking.merge(ranking) { _, new in new }
                if let counts { list.summary = counts }
            }
        }
    }

    /// Michael's order comes from its own endpoint, with each task's reasons.
    private func page(_ query: TaskQuery) async throws -> (TaskPage, [Task.ID: RankedTask]) {
        guard query.sort == .michael else { return (try await tasks.list(query), [:]) }
        let ranked = try await intelligence.priorities(page: query.page)
        let page = TaskPage(
            tasks: ranked.tasks.map(\.task), page: ranked.page, limit: TaskQuery.pageSize, total: ranked.total, pages: ranked.pages)
        return (page, Dictionary(ranked.tasks.map { ($0.task.id, $0) }) { first, _ in first })
    }

    private func refreshSummary() async {
        guard let counts = try? await tasks.summary() else { return }
        update { $0.summary = counts }
    }

    private func resolvedTimeZone() async throws -> String {
        if let timeZone { return timeZone }
        let resolved = try await profiles.profile()?.timeZone ?? "UTC"
        timeZone = resolved
        return resolved
    }

    private func show(_ list: TaskList) {
        state = list.tasks.isEmpty ? .empty(list) : .content(list)
    }

    private func update(_ edit: (inout TaskList) -> Void) {
        guard var list else { return }
        edit(&list)
        show(list)
    }
}
