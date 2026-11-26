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
    private let intelligence: any TaskIntelligenceRepository
    private let profiles: any ProfileRepository
    private let version: Int
    private let actions: TasksActions

    public init(
        tasks: any TaskRepository, intelligence: any TaskIntelligenceRepository, profiles: any ProfileRepository, version: Int,
        actions: TasksActions
    ) {
        self.tasks = tasks
        self.intelligence = intelligence
        self.profiles = profiles
        self.version = version
        self.actions = actions
    }

    public var body: some View {
        TasksHost(
            model: TasksModel(tasks: tasks, intelligence: intelligence, profiles: profiles), tasks: tasks, intelligence: intelligence,
            version: version, actions: actions)
    }
}

enum TaskRoute: Hashable {
    case task(Task.ID)
}

private struct EditorRequest: Identifiable {
    let id = UUID()
    let task: Task?
}

private struct TasksHost: View {
    @State private var model: TasksModel
    let tasks: any TaskRepository
    let intelligence: any TaskIntelligenceRepository
    let version: Int
    let actions: TasksActions
    @State private var editor: EditorRequest?
    @State private var explained: RankedTask?
    @State private var search = ""
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dynamicTypeSize) private var typeSize

    init(
        model: @autoclosure () -> TasksModel, tasks: any TaskRepository, intelligence: any TaskIntelligenceRepository, version: Int,
        actions: TasksActions
    ) {
        _model = State(initialValue: model())
        self.tasks = tasks
        self.intelligence = intelligence
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
            .modifier(Searchable(isOn: model.query.sort != .michael, text: $search))
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
            .sheet(item: $explained) { PriorityBreakdownSheet(item: $0) }
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
                if model.query.sort == .michael {
                    Text(String(localized: "tasks.michael.note", bundle: .module))
                        .michaelText(.caption)
                        .foregroundStyle(Color.michael.muted)
                } else {
                    ChoiceControl(
                        label: String(localized: "tasks.view.label", bundle: .module),
                        selection: Binding(get: { model.query.view }, set: { model.select(view: $0) }),
                        options: TaskView.allCases,
                        title: TasksHost.title
                    )
                }
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
        let layout =
            typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: MichaelSpace.xs))
            : AnyLayout(HStackLayout())
        return layout {
            Text(TasksHost.count(list))
                .michaelText(.label)
                .foregroundStyle(Color.michael.muted)
            if !typeSize.isAccessibilitySize { Spacer(minLength: MichaelSpace.sm) }
            Menu {
                Picker(
                    String(localized: "tasks.sort", bundle: .module),
                    selection: Binding(get: { model.query.sort }, set: { model.select(sort: $0) })
                ) {
                    ForEach(TaskSort.allCases, id: \.self) { sort in Text(TasksHost.title(sort)).tag(sort) }
                }
                if model.query.sort != .michael {
                    Picker(
                        String(localized: "tasks.priorityFilter", bundle: .module),
                        selection: Binding(get: { model.query.priority }, set: { model.select(priority: $0) })
                    ) {
                        Text(String(localized: "tasks.priority.any", bundle: .module)).tag(TaskPriority?.none)
                        ForEach([TaskPriority.high, .medium, .low], id: \.self) { priority in
                            Text(TaskFormat.priority(priority)).tag(TaskPriority?.some(priority))
                        }
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
                TaskRowView(
                    task: task,
                    status: list.status(of: task),
                    today: list.summary?.today,
                    timeZone: TaskFormat.zone(list.timeZone),
                    rollback: list.rollbacks[task.id],
                    ranked: list.ranking[task.id],
                    onExplain: { explained = list.ranking[task.id] },
                    onToggle: { _Concurrency.Task { await model.toggle(task.id) } }
                )
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
            insights: TaskInsightsModel(taskID: id, intelligence: intelligence),
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
        case .michael: String(localized: "tasks.sort.michael", bundle: .module)
        }
    }

    static func count(_ list: TaskList) -> String {
        let total = String(localized: "tasks.count \(list.total)", bundle: .module)
        guard let overdue = list.summary?.overdue, overdue > 0, list.query.view != .overdue else { return total }
        return String(localized: "tasks.count.overdue \(total) \(overdue)", bundle: .module)
    }
}
