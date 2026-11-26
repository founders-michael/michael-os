import DesignSystem
import Models
import Repositories
import SwiftUI

/// Where the habit screens send the user, and how they tell the rest of the app that a habit changed.
public struct HabitsActions {
    /// Opens Michael with a question or a drafting request filled in. It is never sent on the user's behalf.
    let ask: (String) -> Void
    /// A habit or check-in changed here; My Day reloads.
    let changed: () -> Void

    public init(ask: @escaping (String) -> Void, changed: @escaping () -> Void) {
        self.ask = ask
        self.changed = changed
    }
}

/// The Habits screen, pushed from More.
public struct HabitsScreen: View {
    private let habits: any HabitRepository
    private let profiles: any ProfileRepository
    private let actions: HabitsActions

    public init(habits: any HabitRepository, profiles: any ProfileRepository, actions: HabitsActions) {
        self.habits = habits
        self.profiles = profiles
        self.actions = actions
    }

    public var body: some View {
        HabitsHost(model: HabitsModel(habits: habits, profiles: profiles), habits: habits, actions: actions)
    }
}

private struct EditorRequest: Identifiable {
    let id = UUID()
    let habit: Habit?
}

private struct HabitsHost: View {
    @State private var model: HabitsModel
    let habits: any HabitRepository
    let actions: HabitsActions
    @State private var editor: EditorRequest?
    @State private var opened: Habit.ID?
    @Environment(\.scenePhase) private var scenePhase

    init(model: @autoclosure () -> HabitsModel, habits: any HabitRepository, actions: HabitsActions) {
        _model = State(initialValue: model())
        self.habits = habits
        self.actions = actions
    }

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MichaelBackground())
            .navigationTitle(String(localized: "habits.title", bundle: .module))
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        editor = EditorRequest(habit: nil)
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel(String(localized: "habits.new", bundle: .module))
                }
            }
            .task(id: scenePhase == .active) {
                guard scenePhase == .active else { return }
                await model.load()
            }
            .navigationDestination(item: $opened) { id in
                if let habit = model.habit(id) {
                    HabitDetailScreen(model: HabitDetailModel(habit: habit, habits: habits), habits: habits) { change in
                        switch change {
                        case .saved(let habit): model.replace(habit)
                        case .deleted: model.remove(habit.id)
                        }
                        actions.changed()
                    }
                }
            }
            .sheet(item: $editor) { request in
                HabitEditorSheet(model: HabitEditorModel(habit: request.habit, habits: habits)) { saved in
                    model.replace(saved)
                    actions.changed()
                }
            }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            ProgressView().accessibilityLabel(String(localized: "habits.loading", bundle: .module))
        case .failed(let error):
            FailureStateView(message: HabitFormat.loadMessage(error)) { _Concurrency.Task { await model.load() } }
        case .content(let habits):
            list(habits)
        case .empty:
            list([])
        }
    }

    private func list(_ habits: [Habit]) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: MichaelSpace.md) {
                if let line = model.line, !model.showsArchived { MichaelLineCard(line: line, ask: actions.ask) }
                HabitCaptureBar(ask: actions.ask)
                Text(String(localized: "habits.today \(model.completedToday) \(model.scheduledToday)", bundle: .module))
                    .michaelText(.label)
                    .foregroundStyle(Color.michael.muted)
                MichaelSegmentedControl(
                    selection: Binding(get: { model.showsArchived }, set: { model.show(archived: $0) }),
                    options: [false, true],
                    title: {
                        $0 ? String(localized: "habits.archived", bundle: .module) : String(localized: "habits.active", bundle: .module)
                    }
                )
                if habits.isEmpty {
                    empty
                } else {
                    sections(habits)
                }
            }
            .padding(.horizontal, MichaelSpace.screenGutter)
            .padding(.bottom, MichaelSpace.xl)
        }
        .refreshable { await model.load() }
        .sensoryFeedback(.warning, trigger: model.rollbacks.count) { old, new in new > old }
    }

    @ViewBuilder private func sections(_ habits: [Habit]) -> some View {
        let today = habits.filter { $0.todayScheduled && $0.status == .active }
        let rest = habits.filter { !($0.todayScheduled && $0.status == .active) }
        if !today.isEmpty {
            section(String(localized: "habits.section.today", bundle: .module), today)
        }
        if !rest.isEmpty {
            section(
                model.showsArchived
                    ? String(localized: "habits.section.archived", bundle: .module)
                    : String(localized: "habits.section.other", bundle: .module),
                rest)
        }
    }

    private func section(_ title: String, _ habits: [Habit]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .michaelText(.eyebrow)
                .foregroundStyle(Color.michael.muted)
                .accessibilityAddTraits(.isHeader)
                .padding(.bottom, MichaelSpace.xs)
            ForEach(habits) { habit in
                HabitRow(
                    habit: habit, isDone: model.isDone(habit), problem: model.rollbacks[habit.id],
                    onToggle: {
                        _Concurrency.Task {
                            await model.toggle(habit.id)
                            actions.changed()
                        }
                    },
                    onOpen: { opened = habit.id }
                )
            }
        }
    }

    @ViewBuilder private var empty: some View {
        if model.showsArchived {
            Text(String(localized: "habits.empty.archived", bundle: .module))
                .michaelText(.body)
                .foregroundStyle(Color.michael.muted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, MichaelSpace.xxl)
        } else {
            EmptyStateView(
                title: String(localized: "habits.empty.title", bundle: .module),
                message: String(localized: "habits.empty.message", bundle: .module),
                actionTitle: String(localized: "habits.new", bundle: .module)
            ) { editor = EditorRequest(habit: nil) }
        }
    }
}

/// A habit in the list: today's check (when scheduled), the name, the schedule and the streak.
private struct HabitRow: View {
    let habit: Habit
    let isDone: Bool
    let problem: AppError?
    let onToggle: () -> Void
    let onOpen: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            HStack(alignment: .top, spacing: MichaelSpace.md) {
                if habit.todayScheduled && habit.status == .active {
                    MichaelCheck(
                        isChecked: isDone,
                        label: isDone
                            ? String(localized: "habits.undo \(habit.title)", bundle: .module)
                            : String(localized: "habits.checkIn \(habit.title)", bundle: .module),
                        action: onToggle
                    )
                }
                Button(action: onOpen) {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: MichaelSpace.xs) {
                            Text(habit.title)
                                .michaelText(.body)
                                .foregroundStyle(Color.michael.text)
                                .multilineTextAlignment(.leading)
                            Text(HabitFormat.schedule(habit))
                                .michaelText(.caption)
                                .foregroundStyle(Color.michael.muted)
                            if !(habit.todayScheduled && habit.status == .active) && habit.status == .active {
                                Text(String(localized: "habits.notToday", bundle: .module))
                                    .michaelText(.caption)
                                    .foregroundStyle(Color.michael.faint)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        if habit.currentStreak > 0 {
                            Text(String(localized: "habits.streak \(habit.currentStreak)", bundle: .module))
                                .michaelText(.label)
                                .foregroundStyle(Color.michael.atext)
                                .monospacedDigit()
                        }
                        Image(systemName: "chevron.right")
                            .foregroundStyle(Color.michael.faint)
                            .accessibilityHidden(true)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isButton)
            }
            if let problem {
                Text(HabitFormat.rollback(problem))
                    .michaelText(.caption)
                    .foregroundStyle(Color.michael.danger)
            }
        }
        .padding(.vertical, MichaelSpace.sm)
        .overlay(alignment: .bottom) { Divider().overlay(Color.michael.border) }
    }
}

/// Michael's line: computed from the habits on screen, its action fills Michael's composer.
private struct MichaelLineCard: View {
    let line: HabitLine
    let ask: (String) -> Void

    var body: some View {
        AICard {
            HStack(alignment: .top, spacing: MichaelSpace.sm) {
                MichaelOrb(size: .small).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: MichaelSpace.sm) {
                    Text(HabitFormat.line(line))
                        .michaelText(.body)
                        .foregroundStyle(Color.michael.text)
                    if case .next(let habit) = line.kind {
                        MichaelButton(String(localized: "habits.line.action", bundle: .module), size: .small) {
                            ask(String(localized: "habits.line.prompt \(habit.title)", bundle: .module))
                        }
                    }
                }
            }
        }
    }
}

/// Natural-language capture: the words go to Michael as a drafting request, which the user then sends.
private struct HabitCaptureBar: View {
    let ask: (String) -> Void
    @State private var text = ""

    var body: some View {
        HStack(spacing: MichaelSpace.sm) {
            TextField(String(localized: "habits.capture.placeholder", bundle: .module), text: $text, axis: .vertical)
                .lineLimit(1...3)
                .michaelText(.body)
                .accessibilityLabel(String(localized: "habits.capture.label", bundle: .module))
                .onSubmit(send)
            Button(action: send) {
                Image(systemName: "arrow.right")
                    .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
            }
            .buttonStyle(.plain)
            .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .accessibilityLabel(String(localized: "habits.capture.send", bundle: .module))
        }
        .michaelFieldFrame()
    }

    private func send() {
        let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !words.isEmpty else { return }
        ask(String(localized: "habits.capture.prompt \(words)", bundle: .module))
        text = ""
    }
}
