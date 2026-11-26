import DesignSystem
import Models
import Repositories
import SwiftUI

public struct MyDayScreen: View {
    private let days: any MyDayRepository
    private let tasks: any TaskRepository
    private let habits: any HabitRepository
    private let actions: MyDayActions
    private let version: Int
    @Binding private var requestedDate: LocalDate?

    /// `requestedDate` is kept by the app across relaunch, so a user reading last Tuesday comes back to it. Nil
    /// follows the server's today. `version` moves whenever another screen changed a task.
    public init(
        days: any MyDayRepository,
        tasks: any TaskRepository,
        habits: any HabitRepository,
        requestedDate: Binding<LocalDate?>,
        version: Int,
        actions: MyDayActions
    ) {
        self.days = days
        self.tasks = tasks
        self.habits = habits
        _requestedDate = requestedDate
        self.version = version
        self.actions = actions
    }

    public var body: some View {
        MyDayHost(
            model: MyDayModel(days: days, tasks: tasks, habits: habits, requestedDate: requestedDate),
            version: version,
            actions: actions
        ) { requestedDate = $0 }
    }
}

/// Where My Day sends the user. Each opens another tab; none of them saves anything.
public struct MyDayActions {
    /// Opens Michael with the notice's question filled in. It is never sent on the user's behalf.
    let ask: (String?) -> Void
    let addTask: () -> Void
    let openCalendar: () -> Void
    /// A task was completed or reopened here; the Tasks tab reloads.
    let changed: () -> Void

    public init(
        ask: @escaping (String?) -> Void, addTask: @escaping () -> Void, openCalendar: @escaping () -> Void,
        changed: @escaping () -> Void
    ) {
        self.ask = ask
        self.addTask = addTask
        self.openCalendar = openCalendar
        self.changed = changed
    }
}

private struct MyDayHost: View {
    @State private var model: MyDayModel
    let version: Int
    let actions: MyDayActions
    let onDateChange: (LocalDate?) -> Void
    @Environment(\.scenePhase) private var scenePhase

    init(
        model: @autoclosure () -> MyDayModel, version: Int, actions: MyDayActions, onDateChange: @escaping (LocalDate?) -> Void
    ) {
        _model = State(initialValue: model())
        self.version = version
        self.actions = actions
        self.onDateChange = onDateChange
    }

    private struct Trigger: Equatable {
        let date: LocalDate?
        let active: Bool
        let version: Int
    }

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MichaelBackground())
            .toolbar(.hidden, for: .navigationBar)
            .task(id: Trigger(date: model.requestedDate, active: scenePhase == .active, version: version)) {
                guard scenePhase == .active else { return }
                await model.appear(version: version)
            }
            .onChange(of: model.requestedDate) { _, date in onDateChange(date) }
            .sensoryFeedback(.warning, trigger: model.day?.rollbacks.count ?? 0) { old, new in new > old }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            MyDaySkeleton()
                .transition(.opacity)
        case .failed(let error):
            FailureStateView(message: error.loadMessage) {
                _Concurrency.Task { await model.load() }
            }
        case .content(let day):
            dayView(day, isEmpty: false)
        case .empty(let day):
            dayView(day, isEmpty: true)
        }
    }

    private func dayView(_ day: MyDayContent, isEmpty: Bool) -> some View {
        MyDayContentView(
            day: day,
            isEmpty: isEmpty,
            now: Date(),
            onStep: { model.step(by: $0) },
            onToday: { model.showToday() },
            onToggleTask: { id in
                _Concurrency.Task {
                    if await model.toggleTask(id) { actions.changed() }
                }
            },
            onToggleHabit: { id in _Concurrency.Task { await model.toggleHabit(id) } },
            onRefresh: { await model.refresh() },
            actions: actions
        )
    }
}
