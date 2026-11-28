import DesignSystem
import Models
import Repositories
import SwiftUI

/// Where the goal screens send the user.
public struct GoalsActions {
    /// Opens Michael with a question or a drafting request filled in. It is never sent on the user's behalf.
    let ask: (String) -> Void

    public init(ask: @escaping (String) -> Void) {
        self.ask = ask
    }
}

/// The Goals screen, pushed from More.
public struct GoalsScreen: View {
    private let goals: any GoalRepository
    private let actions: GoalsActions

    public init(goals: any GoalRepository, actions: GoalsActions) {
        self.goals = goals
        self.actions = actions
    }

    public var body: some View {
        GoalsHost(model: GoalsModel(goals: goals), goals: goals, actions: actions)
    }
}

private struct EditorRequest: Identifiable {
    let id = UUID()
    let goal: Goal?
}

private struct GoalsHost: View {
    @State private var model: GoalsModel
    let goals: any GoalRepository
    let actions: GoalsActions
    @State private var editor: EditorRequest?
    @State private var opened: Goal.ID?
    @Environment(\.scenePhase) private var scenePhase

    init(model: @autoclosure () -> GoalsModel, goals: any GoalRepository, actions: GoalsActions) {
        _model = State(initialValue: model())
        self.goals = goals
        self.actions = actions
    }

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MichaelBackground())
            .navigationTitle(String(localized: "goals.title", bundle: .module))
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        editor = EditorRequest(goal: nil)
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel(String(localized: "goals.new", bundle: .module))
                }
            }
            .task(id: scenePhase == .active) {
                guard scenePhase == .active else { return }
                await model.load()
            }
            .navigationDestination(item: $opened) { id in
                if let goal = model.goal(id), let today = model.today {
                    GoalDetailScreen(
                        model: GoalDetailModel(goal: goal, today: today, goals: goals), goals: goals, ask: actions.ask
                    ) { change in
                        switch change {
                        case .saved(let goal): model.replace(goal)
                        case .deleted: model.remove(goal.id)
                        }
                    }
                }
            }
            .sheet(item: $editor) { request in
                GoalEditorSheet(model: GoalEditorModel(goal: request.goal, goals: goals)) { saved in model.replace(saved) }
            }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            ProgressView().accessibilityLabel(String(localized: "goals.loading", bundle: .module))
        case .failed(let error):
            FailureStateView(message: GoalFormat.loadMessage(error)) { _Concurrency.Task { await model.load() } }
        case .content(let goals):
            list(goals)
        case .empty:
            list([])
        }
    }

    private func list(_ goals: [Goal]) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: MichaelSpace.md) {
                MichaelButton(String(localized: "goals.draft", bundle: .module), style: .secondary, size: .small) {
                    actions.ask(String(localized: "goals.draft.prompt", bundle: .module))
                }
                MichaelSegmentedControl(
                    selection: Binding(get: { model.filter }, set: { model.show($0) }),
                    options: [GoalStatus.active, .completed, .archived],
                    title: { "\(GoalFormat.status($0)) · \(model.count($0))" }
                )
                if goals.isEmpty {
                    empty
                } else {
                    ForEach(goals) { goal in
                        GoalCard(goal: goal, today: model.today) { opened = goal.id }
                    }
                }
            }
            .padding(.horizontal, MichaelSpace.screenGutter)
            .padding(.bottom, MichaelSpace.xl)
        }
        .refreshable { await model.load() }
    }

    @ViewBuilder private var empty: some View {
        if model.filter == .active {
            EmptyStateView(
                title: String(localized: "goals.empty.title", bundle: .module),
                message: String(localized: "goals.empty.message", bundle: .module),
                actionTitle: String(localized: "goals.new", bundle: .module)
            ) { editor = EditorRequest(goal: nil) }
        } else {
            Text(
                model.filter == .completed
                    ? String(localized: "goals.empty.completed", bundle: .module)
                    : String(localized: "goals.empty.archived", bundle: .module)
            )
            .michaelText(.body)
            .foregroundStyle(Color.michael.muted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, MichaelSpace.xxl)
        }
    }
}

/// A goal in the list: category, title, manual progress, milestone count and when it is due.
private struct GoalCard: View {
    let goal: Goal
    let today: LocalDate?
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            MichaelCard {
                VStack(alignment: .leading, spacing: MichaelSpace.sm) {
                    if let category = goal.category {
                        Text(category).michaelText(.eyebrow).foregroundStyle(Color.michael.muted)
                    }
                    HStack(alignment: .firstTextBaseline) {
                        Text(goal.title)
                            .michaelText(.heading)
                            .foregroundStyle(Color.michael.text)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text("\(goal.progress)%")
                            .michaelText(.label)
                            .foregroundStyle(Color.michael.atext)
                            .monospacedDigit()
                    }
                    MichaelProgressBar(value: Double(goal.progress) / 100)
                    ViewThatFits(in: .horizontal) {
                        HStack { details }
                        VStack(alignment: .leading, spacing: MichaelSpace.xs) { details }
                    }
                    .michaelText(.caption)
                    .foregroundStyle(Color.michael.muted)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }

    @ViewBuilder private var details: some View {
        Text(GoalFormat.milestones(goal))
        Spacer(minLength: MichaelSpace.sm)
        if let today {
            let target = GoalTarget(goal, today: today)
            Text(GoalFormat.target(target)).foregroundStyle(GoalFormat.isWarning(target) ? Color.michael.warn : Color.michael.muted)
        }
    }
}
