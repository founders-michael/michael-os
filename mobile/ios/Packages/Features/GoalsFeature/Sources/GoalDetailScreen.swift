import DesignSystem
import Models
import Repositories
import SwiftUI

enum GoalChange {
    case saved(Goal)
    case deleted
}

/// One goal: manual progress, Michael's read, milestones, and the status actions.
struct GoalDetailScreen: View {
    @State private var model: GoalDetailModel
    let goals: any GoalRepository
    let ask: (String) -> Void
    let onChange: (GoalChange) -> Void
    @State private var editing: Goal?
    @State private var confirmingDelete = false
    @State private var progressDraft: Double?
    @Environment(\.dismiss) private var dismiss

    init(
        model: @autoclosure () -> GoalDetailModel, goals: any GoalRepository, ask: @escaping (String) -> Void,
        onChange: @escaping (GoalChange) -> Void
    ) {
        _model = State(initialValue: model())
        self.goals = goals
        self.ask = ask
        self.onChange = onChange
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MichaelSpace.lg) {
                header
                if let problem = model.problem { ErrorBanner(message: GoalFormat.loadMessage(problem)) }
                progress
                if let read = model.read { ReadCard(goal: model.goal, read: read, busy: model.busy != nil, ask: ask, sync: sync) }
                MilestoneList(model: model)
                actions
            }
            .padding(.horizontal, MichaelSpace.screenGutter)
            .padding(.bottom, MichaelSpace.xl)
        }
        .background(MichaelBackground())
        .navigationTitle(String(localized: "goals.detail.title", bundle: .module))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(String(localized: "goals.detail.edit", bundle: .module)) { editing = model.goal }
            }
        }
        .task { await model.load() }
        .onChange(of: model.goal) { _, goal in onChange(.saved(goal)) }
        .onChange(of: model.deleted) { _, deleted in
            if deleted {
                onChange(.deleted)
                dismiss()
            }
        }
        .sheet(item: $editing) { goal in
            GoalEditorSheet(model: GoalEditorModel(goal: goal, goals: goals)) { saved in model.saved(saved) }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.sm) {
            HStack(spacing: MichaelSpace.xs) {
                if model.goal.status != .active { MichaelChip(GoalFormat.status(model.goal.status)) }
                let target = GoalTarget(model.goal, today: model.today)
                MichaelChip(
                    [model.goal.category, GoalFormat.target(target)].compactMap { $0 }.joined(separator: " · "),
                    tone: GoalFormat.isWarning(target) ? .warn : .plain)
            }
            Text(model.goal.title)
                .michaelText(.display)
                .foregroundStyle(Color.michael.text)
                .accessibilityAddTraits(.isHeader)
            if let notes = model.goal.description {
                Text(notes).michaelText(.body).foregroundStyle(Color.michael.muted)
            }
        }
    }

    private var progress: some View {
        let shown = progressDraft.map { Int($0) } ?? model.goal.progress
        return MichaelCard {
            VStack(alignment: .leading, spacing: MichaelSpace.sm) {
                HStack {
                    Text(String(localized: "goals.detail.progress", bundle: .module)).michaelText(.label).foregroundStyle(
                        Color.michael.muted)
                    Spacer()
                    Text("\(shown)%").michaelText(.stat).foregroundStyle(Color.michael.atext).monospacedDigit()
                }
                MichaelProgressBar(value: Double(shown) / 100)
                if model.goal.status == .active {
                    Slider(
                        value: Binding(get: { progressDraft ?? Double(model.goal.progress) }, set: { progressDraft = $0 }), in: 0...100,
                        step: 5
                    ) { editing in
                        guard !editing, let draft = progressDraft else { return }
                        _Concurrency.Task {
                            await model.setProgress(Int(draft))
                            progressDraft = nil
                        }
                    }
                    .tint(Color.michael.accent)
                    .disabled(model.busy != nil)
                    .accessibilityLabel(String(localized: "goals.detail.adjust", bundle: .module))
                }
                Text(String(localized: "goals.detail.progressHint", bundle: .module)).michaelText(.caption).foregroundStyle(
                    Color.michael.faint)
            }
        }
    }

    private func sync(_ percent: Int) {
        _Concurrency.Task { await model.setProgress(percent) }
    }

    private var actions: some View {
        VStack(spacing: MichaelSpace.sm) {
            switch model.goal.status {
            case .active:
                MichaelButton(String(localized: "goals.detail.complete", bundle: .module)) { set(.completed) }
                MichaelButton(String(localized: "goals.detail.archive", bundle: .module), style: .secondary) { set(.archived) }
            case .completed:
                MichaelButton(String(localized: "goals.detail.reopen", bundle: .module), style: .secondary) { set(.active) }
            case .archived, .unknown:
                MichaelButton(String(localized: "goals.detail.restore", bundle: .module), style: .secondary) { set(.active) }
            }
            MichaelButton(String(localized: "goals.detail.delete", bundle: .module), style: .destructive) { confirmingDelete = true }
        }
        .disabled(model.busy != nil)
        .confirmationDialog(
            String(localized: "goals.delete.title \(model.goal.title)", bundle: .module), isPresented: $confirmingDelete,
            titleVisibility: .visible
        ) {
            Button(String(localized: "goals.delete.confirm", bundle: .module), role: .destructive) {
                _Concurrency.Task { await model.delete() }
            }
        } message: {
            Text(String(localized: "goals.delete.message", bundle: .module))
        }
    }

    private func set(_ status: GoalStatus) {
        _Concurrency.Task { await model.setStatus(status) }
    }
}

/// Michael's read: computed from the goal's saved fields; its actions fill Michael's composer or save progress.
private struct ReadCard: View {
    let goal: Goal
    let read: GoalRead
    let busy: Bool
    let ask: (String) -> Void
    let sync: (Int) -> Void

    var body: some View {
        AICard {
            HStack(alignment: .top, spacing: MichaelSpace.sm) {
                MichaelOrb(size: .small).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: MichaelSpace.sm) {
                    Text(String(localized: "goals.read.title", bundle: .module)).michaelText(.eyebrow).foregroundStyle(Color.michael.muted)
                    Text(GoalFormat.read(read)).michaelText(.body).foregroundStyle(Color.michael.text)
                    if let next = read.nextMilestone {
                        MichaelButton(String(localized: "goals.read.break \(next)", bundle: .module), size: .small) {
                            ask(String(localized: "goals.read.break.prompt \(next) \(goal.title)", bundle: .module))
                        }
                    } else if read.milestonePercent == nil {
                        MichaelButton(String(localized: "goals.read.suggest", bundle: .module), size: .small) {
                            ask(String(localized: "goals.read.suggest.prompt \(goal.title)", bundle: .module))
                        }
                    }
                    if read.targetPassed {
                        MichaelButton(String(localized: "goals.read.target", bundle: .module), style: .secondary, size: .small) {
                            ask(String(localized: "goals.read.target.prompt \(goal.title)", bundle: .module))
                        }
                    }
                    if read.progressDrift, let percent = read.milestonePercent {
                        MichaelButton(String(localized: "goals.read.sync \(percent)", bundle: .module), style: .ghost, size: .small) {
                            sync(percent)
                        }
                        .disabled(busy)
                    }
                }
            }
        }
    }
}

/// The milestones: check, rename, move, delete, and add, on an active goal only.
private struct MilestoneList: View {
    let model: GoalDetailModel
    @State private var newTitle = ""
    @State private var renaming: GoalMilestone?
    @State private var renameText = ""
    @State private var deleting: GoalMilestone?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(String(localized: "goals.milestones", bundle: .module))
                    .michaelText(.eyebrow)
                    .foregroundStyle(Color.michael.muted)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                if !model.goal.milestones.isEmpty {
                    Text(
                        String(
                            localized: "goals.milestones.count \(model.goal.completedMilestoneCount) \(model.goal.milestoneCount)",
                            bundle: .module)
                    )
                    .michaelText(.caption)
                    .foregroundStyle(Color.michael.muted)
                    .monospacedDigit()
                }
            }
            .padding(.bottom, MichaelSpace.xs)
            if model.goal.milestones.isEmpty {
                Text(String(localized: "goals.milestones.none", bundle: .module))
                    .michaelText(.body)
                    .foregroundStyle(Color.michael.muted)
                    .padding(.vertical, MichaelSpace.sm)
            }
            ForEach(Array(model.goal.milestones.enumerated()), id: \.element.id) { index, milestone in
                row(milestone, index: index)
            }
            if model.goal.status == .active { add }
        }
        .alert(String(localized: "goals.milestone.rename", bundle: .module), isPresented: renameShown) {
            TextField(String(localized: "goals.milestone.title", bundle: .module), text: $renameText)
            Button(String(localized: "goals.milestone.save", bundle: .module)) {
                if let renaming { _Concurrency.Task { await model.rename(renaming, to: renameText) } }
            }
            Button(String(localized: "goals.editor.cancel", bundle: .module), role: .cancel) {}
        }
        .confirmationDialog(
            String(localized: "goals.milestone.delete.title", bundle: .module), isPresented: deleteShown, titleVisibility: .visible
        ) {
            Button(String(localized: "goals.milestone.delete", bundle: .module), role: .destructive) {
                if let deleting { _Concurrency.Task { await model.delete(deleting) } }
            }
        } message: {
            Text(deleting?.title ?? "")
        }
    }

    private var renameShown: Binding<Bool> {
        Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })
    }

    private var deleteShown: Binding<Bool> {
        Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })
    }

    private func row(_ milestone: GoalMilestone, index: Int) -> some View {
        let done = model.isDone(milestone)
        return HStack(spacing: MichaelSpace.md) {
            MichaelCheck(
                isChecked: done,
                label: done
                    ? String(localized: "goals.milestone.reopen \(milestone.title)", bundle: .module)
                    : String(localized: "goals.milestone.complete \(milestone.title)", bundle: .module)
            ) { _Concurrency.Task { await model.toggle(milestone) } }
            .disabled(!model.isWorkable)
            Text(milestone.title)
                .michaelText(.body)
                .foregroundStyle(done ? Color.michael.faint : Color.michael.text)
                .strikethrough(done)
                .frame(maxWidth: .infinity, alignment: .leading)
            if model.goal.status == .active {
                Menu {
                    Button(String(localized: "goals.milestone.rename", bundle: .module)) {
                        renameText = milestone.title
                        renaming = milestone
                    }
                    if index > 0 {
                        Button(String(localized: "goals.milestone.up", bundle: .module)) {
                            _Concurrency.Task { await model.move(milestone, by: -1) }
                        }
                    }
                    if index < model.goal.milestones.count - 1 {
                        Button(String(localized: "goals.milestone.down", bundle: .module)) {
                            _Concurrency.Task { await model.move(milestone, by: 1) }
                        }
                    }
                    Button(String(localized: "goals.milestone.delete", bundle: .module), role: .destructive) { deleting = milestone }
                } label: {
                    Image(systemName: "ellipsis")
                        .foregroundStyle(Color.michael.muted)
                        .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
                }
                .disabled(!model.isWorkable)
                .accessibilityLabel(String(localized: "goals.milestone.actions \(milestone.title)", bundle: .module))
            }
        }
        .padding(.vertical, MichaelSpace.xs)
        .overlay(alignment: .bottom) { Divider().overlay(Color.michael.border) }
    }

    private var add: some View {
        HStack(spacing: MichaelSpace.sm) {
            TextField(String(localized: "goals.milestone.add", bundle: .module), text: $newTitle)
                .michaelText(.body)
                .submitLabel(.done)
                .onSubmit(submit)
            Button(action: submit) {
                Image(systemName: "plus")
                    .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
            }
            .buttonStyle(.plain)
            .disabled(newTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !model.isWorkable)
            .accessibilityLabel(String(localized: "goals.milestone.add", bundle: .module))
        }
        .michaelFieldFrame()
        .padding(.top, MichaelSpace.sm)
    }

    private func submit() {
        let title = newTitle
        _Concurrency.Task {
            if await model.addMilestone(title) { newTitle = "" }
        }
    }
}
