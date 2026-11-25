import DesignSystem
import Models
import Repositories
import SwiftUI

/// Where the task screens send the user, and how they tell the rest of the app that a task changed.
public struct TasksActions {
    /// Opens Michael with a drafting request filled in. It is never sent on the user's behalf.
    let ask: (String) -> Void
    /// A task was created, changed or deleted here; screens that show tasks reload.
    let changed: () -> Void

    public init(ask: @escaping (String) -> Void, changed: @escaping () -> Void) {
        self.ask = ask
        self.changed = changed
    }
}

/// The Tasks tab's root. `version` moves whenever another screen changed a task.
public struct TasksScreen: View {
    private let tasks: any TaskRepository
    private let profiles: any ProfileRepository
    private let version: Int
    private let actions: TasksActions

    public init(tasks: any TaskRepository, profiles: any ProfileRepository, version: Int, actions: TasksActions) {
        self.tasks = tasks
        self.profiles = profiles
        self.version = version
        self.actions = actions
    }

    public var body: some View {
        TasksHost(model: TasksModel(tasks: tasks, profiles: profiles), tasks: tasks, version: version, actions: actions)
    }
}

private enum TaskRoute: Hashable {
    case task(Task.ID)
}

private struct EditorRequest: Identifiable {
    let id = UUID()
    let task: Task?
}

private struct TasksHost: View {
    @State private var model: TasksModel
    let tasks: any TaskRepository
    let version: Int
    let actions: TasksActions
    @State private var editor: EditorRequest?
    @State private var search = ""
    @Environment(\.scenePhase) private var scenePhase

    init(model: @autoclosure () -> TasksModel, tasks: any TaskRepository, version: Int, actions: TasksActions) {
        _model = State(initialValue: model())
        self.tasks = tasks
        self.version = version
        self.actions = actions
    }

    private struct Trigger: Equatable {
        let version: Int
        let active: Bool
    }

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MichaelBackground())
            .navigationTitle(String(localized: "tasks.title", bundle: .module))
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        editor = EditorRequest(task: nil)
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel(String(localized: "tasks.new", bundle: .module))
                    .disabled(model.list == nil)
                }
            }
            .searchable(text: $search, prompt: String(localized: "tasks.search", bundle: .module))
            .onChange(of: search) { _, text in model.search(text) }
            .task(id: Trigger(version: version, active: scenePhase == .active)) {
                guard scenePhase == .active else { return }
                await model.appear(version: version)
            }
            .navigationDestination(for: TaskRoute.self) { route in
                switch route {
                case .task(let id): detail(id)
                }
            }
            .sheet(item: $editor) { request in
                TaskEditorSheet(
                    model: TaskEditorModel(
                        task: request.task, timeZone: model.list?.timeZone ?? "UTC", today: model.list?.summary?.today,
                        tasks: tasks
                    )
                ) { saved in
                    if request.task == nil { model.created(saved) } else { model.saved(saved) }
                    actions.changed()
                }
            }
            .sensoryFeedback(.warning, trigger: model.list?.rollbacks.count ?? 0) { old, new in new > old }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            TasksSkeleton()
        case .failed(let error):
            FailureStateView(message: error.loadMessage) {
                _Concurrency.Task { await model.load() }
            }
        case .content(let list):
            listView(list, isEmpty: false)
        case .empty(let list):
            listView(list, isEmpty: true)
        }
    }

    private func listView(_ list: TaskList, isEmpty: Bool) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: MichaelSpace.md) {
                CaptureBar(ask: actions.ask)
                MichaelSegmentedControl(
                    selection: Binding(get: { model.query.view }, set: { model.select(view: $0) }),
                    options: TaskView.allCases,
                    title: TasksHost.title
                )
                header(list)
                if let problem = list.refreshProblem {
                    ErrorBanner(message: problem.loadMessage)
                }
                if isEmpty {
                    TasksEmptyState(query: model.query) { editor = EditorRequest(task: nil) }
                } else {
                    rows(list)
                }
            }
            .padding(.horizontal, MichaelSpace.screenGutter)
            .padding(.bottom, MichaelSpace.xl)
        }
        .refreshable { await model.refresh() }
        .overlay(alignment: .top) {
            if list.isRefreshing {
                ProgressView()
                    .padding(.top, MichaelSpace.sm)
                    .accessibilityLabel(String(localized: "tasks.refreshing", bundle: .module))
            }
        }
    }

    private func header(_ list: TaskList) -> some View {
        HStack {
            Text(TasksHost.count(list))
                .michaelText(.label)
                .foregroundStyle(Color.michael.muted)
            Spacer(minLength: MichaelSpace.sm)
            Menu {
                Picker(
                    String(localized: "tasks.sort", bundle: .module),
                    selection: Binding(get: { model.query.sort }, set: { model.select(sort: $0) })
                ) {
                    ForEach(TaskSort.allCases, id: \.self) { sort in Text(TasksHost.title(sort)).tag(sort) }
                }
                Picker(
                    String(localized: "tasks.priorityFilter", bundle: .module),
                    selection: Binding(get: { model.query.priority }, set: { model.select(priority: $0) })
                ) {
                    Text(String(localized: "tasks.priority.any", bundle: .module)).tag(TaskPriority?.none)
                    ForEach([TaskPriority.high, .medium, .low], id: \.self) { priority in
                        Text(TaskFormat.priority(priority)).tag(TaskPriority?.some(priority))
                    }
                }
            } label: {
                Label(TasksHost.title(model.query.sort), systemImage: "line.3.horizontal.decrease")
                    .michaelText(.label)
                    .foregroundStyle(Color.michael.muted)
                    .frame(minHeight: MichaelSize.checkTouch)
            }
            .accessibilityLabel(String(localized: "tasks.sortAndFilter \(TasksHost.title(model.query.sort))", bundle: .module))
        }
    }

    @ViewBuilder private func rows(_ list: TaskList) -> some View {
        VStack(spacing: 0) {
            ForEach(list.tasks) { task in
                NavigationLink(value: TaskRoute.task(task.id)) {
                    TaskRowView(
                        task: task,
                        status: list.status(of: task),
                        today: list.summary?.today,
                        timeZone: TaskFormat.zone(list.timeZone),
                        rollback: list.rollbacks[task.id],
                        onToggle: { _Concurrency.Task { await model.toggle(task.id) } }
                    )
                }
                .buttonStyle(.plain)
                .onAppear {
                    if task.id == list.tasks.last?.id { _Concurrency.Task { await model.loadMore() } }
                }
            }
        }
        if list.isLoadingMore {
            ProgressView()
                .frame(maxWidth: .infinity, minHeight: MichaelSize.checkTouch)
                .accessibilityLabel(String(localized: "tasks.loadingMore", bundle: .module))
        } else if let problem = list.moreProblem {
            VStack(alignment: .leading, spacing: MichaelSpace.sm) {
                ErrorBanner(message: problem.loadMessage)
                MichaelButton(String(localized: "tasks.loadMore.retry", bundle: .module), style: .secondary, size: .small) {
                    _Concurrency.Task { await model.loadMore() }
                }
            }
        }
    }

    private func detail(_ id: Task.ID) -> some View {
        let list = model.list
        return TaskDetailScreen(
            model: TaskDetailModel(
                id: id,
                shown: list?.tasks.first { $0.id == id },
                timeZone: list?.timeZone ?? "UTC",
                today: list?.summary?.today,
                tasks: tasks
            ),
            tasks: tasks,
            onSaved: { task in
                model.saved(task)
                actions.changed()
            },
            onDeleted: {
                model.removed(id)
                actions.changed()
            }
        )
    }

    static func title(_ view: TaskView) -> String {
        switch view {
        case .all: String(localized: "tasks.view.all", bundle: .module)
        case .pending: String(localized: "tasks.view.pending", bundle: .module)
        case .completed: String(localized: "tasks.view.completed", bundle: .module)
        case .overdue: String(localized: "tasks.view.overdue", bundle: .module)
        }
    }

    static func title(_ sort: TaskSort) -> String {
        switch sort {
        case .recent: String(localized: "tasks.sort.recent", bundle: .module)
        case .dueDate: String(localized: "tasks.sort.dueDate", bundle: .module)
        case .priority: String(localized: "tasks.sort.priority", bundle: .module)
        }
    }

    static func count(_ list: TaskList) -> String {
        let total = String(localized: "tasks.count \(list.total)", bundle: .module)
        guard let overdue = list.summary?.overdue, overdue > 0, list.query.view != .overdue else { return total }
        return String(localized: "tasks.count.overdue \(total) \(overdue)", bundle: .module)
    }
}

/// Natural-language capture: the words go to Michael as a drafting request, which the user then sends. Michael's
/// draft card shows what he understood before anything is saved.
private struct CaptureBar: View {
    let ask: (String) -> Void
    @State private var text = ""

    static let limit = 340

    var body: some View {
        AICard {
            HStack(spacing: MichaelSpace.sm) {
                MichaelOrb(size: .small)
                    .accessibilityHidden(true)
                TextField(String(localized: "tasks.capture.placeholder", bundle: .module), text: $text)
                    .michaelText(.body)
                    .foregroundStyle(Color.michael.text)
                    .submitLabel(.send)
                    .onSubmit(send)
                    .accessibilityLabel(String(localized: "tasks.capture.label", bundle: .module))
                    .onChange(of: text) { _, value in if value.count > Self.limit { text = String(value.prefix(Self.limit)) } }
                Button(action: send) {
                    Image(systemName: "arrow.right")
                        .foregroundStyle(Color.michael.text)
                        .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
                        .background(Color.michael.raise, in: RoundedRectangle(cornerRadius: MichaelRadius.buttonSmall))
                }
                .buttonStyle(.plain)
                .disabled(trimmed.isEmpty)
                .accessibilityLabel(String(localized: "tasks.capture.send", bundle: .module))
            }
        }
    }

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func send() {
        guard !trimmed.isEmpty else { return }
        ask(String(localized: "tasks.capture.prompt \(trimmed)", bundle: .module))
        text = ""
    }
}

private struct TasksEmptyState: View {
    let query: TaskQuery
    let onCreate: () -> Void

    var body: some View {
        if query.view == .all && query.priority == nil && query.search.isEmpty {
            EmptyStateView(
                title: String(localized: "tasks.empty.title", bundle: .module),
                message: String(localized: "tasks.empty.message", bundle: .module),
                actionTitle: String(localized: "tasks.empty.action", bundle: .module),
                action: onCreate
            )
        } else {
            VStack(spacing: MichaelSpace.sm) {
                Text(title)
                    .michaelText(.title)
                    .foregroundStyle(Color.michael.text)
                Text(String(localized: "tasks.empty.filtered.message", bundle: .module))
                    .michaelText(.body)
                    .foregroundStyle(Color.michael.muted)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, MichaelSpace.xxl)
        }
    }

    private var title: String {
        if !query.search.isEmpty { return String(localized: "tasks.empty.search \(query.search)", bundle: .module) }
        switch query.view {
        case .overdue: return String(localized: "tasks.empty.overdue", bundle: .module)
        case .completed: return String(localized: "tasks.empty.completed", bundle: .module)
        case .pending: return String(localized: "tasks.empty.pending", bundle: .module)
        case .all: return String(localized: "tasks.empty.priority", bundle: .module)
        }
    }
}

private struct TasksSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.md) {
            SkeletonBlock(height: MichaelSize.field)
            SkeletonBlock(height: MichaelSize.checkTouch)
            ForEach(0..<6, id: \.self) { _ in
                SkeletonBlock(height: MichaelSize.field)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, MichaelSpace.screenGutter)
        .accessibilityElement()
        .accessibilityLabel(String(localized: "tasks.loading", bundle: .module))
    }
}
