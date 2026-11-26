import DesignSystem
import Models
import SwiftUI

/// The goals a task supports. Linked goals lift the task in Michael's order as their target dates near.
struct TaskGoalsSection: View {
    let model: TaskInsightsModel

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.sm) {
            Label(String(localized: "tasks.goals.title", bundle: .module), systemImage: "target")
                .michaelText(.label)
                .foregroundStyle(Color.michael.muted)
                .accessibilityAddTraits(.isHeader)
            if model.linked == nil {
                ProgressView().accessibilityLabel(String(localized: "tasks.goals.loading", bundle: .module))
            } else if model.goalChoices.isEmpty {
                Text(String(localized: "tasks.goals.none", bundle: .module))
                    .michaelText(.body)
                    .foregroundStyle(Color.michael.muted)
            } else {
                MichaelCard {
                    VStack(alignment: .leading, spacing: MichaelSpace.xs) {
                        ForEach(model.goalChoices) { goal in
                            MichaelToggle(
                                goalLabel(goal),
                                isOn: Binding(get: { model.isLinked(goal) }, set: { _ in _Concurrency.Task { await model.toggle(goal) } })
                            )
                            .disabled(model.busy != nil || !model.canLink(goal))
                        }
                    }
                }
                if (model.linked?.count ?? 0) >= TaskInsightsModel.goalLimit {
                    Text(String(localized: "tasks.goals.limit", bundle: .module))
                        .michaelText(.caption)
                        .foregroundStyle(Color.michael.muted)
                }
            }
        }
    }

    private func goalLabel(_ goal: GoalLink) -> String {
        guard let target = goal.targetDate else { return goal.title }
        return String(localized: "tasks.goals.target \(goal.title) \(TaskFormat.shortDate(target))", bundle: .module)
    }
}

/// A task's categories. Michael's suggestions are marked as suggestions, with their confidence, until confirmed.
struct TaskCategoriesSection: View {
    let model: TaskInsightsModel

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.sm) {
            Label(String(localized: "tasks.categories.title", bundle: .module), systemImage: "sparkles")
                .michaelText(.label)
                .foregroundStyle(Color.michael.muted)
                .accessibilityAddTraits(.isHeader)
            if model.classifications == nil {
                ProgressView().accessibilityLabel(String(localized: "tasks.categories.loading", bundle: .module))
            } else if model.confirmed.isEmpty && model.suggestions.isEmpty {
                Text(String(localized: "tasks.categories.none", bundle: .module))
                    .michaelText(.body)
                    .foregroundStyle(Color.michael.muted)
            }
            ForEach(model.confirmed) { row in
                HStack {
                    MichaelChip(row.category.name)
                    Spacer(minLength: MichaelSpace.sm)
                    Button(String(localized: "tasks.categories.remove", bundle: .module)) { _Concurrency.Task { await model.remove(row) } }
                        .michaelText(.label)
                        .foregroundStyle(Color.michael.muted)
                        .accessibilityLabel(String(localized: "tasks.categories.removeLabel \(row.category.name)", bundle: .module))
                        .disabled(model.busy != nil)
                }
            }
            ForEach(model.suggestions) { row in
                VStack(alignment: .leading, spacing: MichaelSpace.xs) {
                    MichaelChip(suggestionText(row), tone: .ai)
                    HStack(spacing: MichaelSpace.sm) {
                        MichaelButton(String(localized: "tasks.categories.confirm", bundle: .module), style: .secondary, size: .small) {
                            _Concurrency.Task { await model.confirm(row) }
                        }
                        MichaelButton(String(localized: "tasks.categories.dismiss", bundle: .module), style: .ghost, size: .small) {
                            _Concurrency.Task { await model.remove(row) }
                        }
                    }
                    .disabled(model.busy != nil)
                }
            }
            if model.needsAcknowledgement {
                acknowledgement
            } else {
                actions
            }
            if model.noSuggestion {
                Text(String(localized: "tasks.categories.noFit", bundle: .module))
                    .michaelText(.caption)
                    .foregroundStyle(Color.michael.muted)
            }
        }
    }

    private var actions: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: MichaelSpace.sm) { buttons }
            VStack(alignment: .leading, spacing: MichaelSpace.sm) { buttons }
        }
    }

    @ViewBuilder private var buttons: some View {
        if model.busy == .suggest {
            ProgressView().accessibilityLabel(String(localized: "tasks.categories.asking", bundle: .module))
        } else {
            MichaelButton(String(localized: "tasks.categories.suggest", bundle: .module), style: .secondary, size: .small) {
                _Concurrency.Task { await model.suggest() }
            }
            .disabled(model.busy != nil)
        }
        if !model.addable.isEmpty {
            Menu {
                ForEach(model.addable) { category in
                    Button(category.name) { _Concurrency.Task { await model.classify(category) } }
                }
            } label: {
                Text(String(localized: "tasks.categories.add", bundle: .module))
                    .michaelText(.button)
                    .foregroundStyle(Color.michael.text)
                    .frame(minHeight: MichaelSize.buttonSmall)
            }
            .disabled(model.busy != nil)
        }
    }

    private var acknowledgement: some View {
        AICard {
            VStack(alignment: .leading, spacing: MichaelSpace.sm) {
                Text(String(localized: "tasks.categories.dataUse", bundle: .module))
                    .michaelText(.body)
                    .foregroundStyle(Color.michael.text)
                HStack(spacing: MichaelSpace.sm) {
                    MichaelButton(String(localized: "tasks.categories.dataUse.accept", bundle: .module), size: .small) {
                        _Concurrency.Task { await model.suggest(acknowledged: true) }
                    }
                    MichaelButton(String(localized: "tasks.categories.dataUse.decline", bundle: .module), style: .ghost, size: .small) {
                        model.declineAcknowledgement()
                    }
                }
            }
        }
    }

    private func suggestionText(_ row: Classification) -> String {
        guard let confidence = row.confidence else {
            return String(localized: "tasks.categories.suggested \(row.category.name)", bundle: .module)
        }
        let percent = Int((confidence * 100).rounded())
        return String(localized: "tasks.categories.suggestedSure \(row.category.name) \(percent)", bundle: .module)
    }
}

/// How Michael ranked one task: every component of the published formula and its points.
struct PriorityBreakdownSheet: View {
    let item: RankedTask
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: MichaelSpace.md) {
                    Text(item.task.title)
                        .michaelText(.title)
                        .foregroundStyle(Color.michael.text)
                    Text(PriorityFormat.why(item))
                        .michaelText(.body)
                        .foregroundStyle(Color.michael.muted)
                    MichaelCard {
                        VStack(alignment: .leading, spacing: MichaelSpace.md) {
                            ForEach(Array(PriorityFormat.breakdown(item).enumerated()), id: \.offset) { _, row in
                                VStack(alignment: .leading, spacing: MichaelSpace.xs) {
                                    HStack(alignment: .firstTextBaseline) {
                                        Text(row.label).foregroundStyle(Color.michael.text)
                                        Spacer(minLength: MichaelSpace.sm)
                                        Text(points(row)).foregroundStyle(Color.michael.muted).monospacedDigit()
                                    }
                                    .michaelText(.label)
                                    if !row.reason.isEmpty {
                                        Text(row.reason)
                                            .michaelText(.caption)
                                            .foregroundStyle(Color.michael.muted)
                                    }
                                }
                                .accessibilityElement(children: .combine)
                            }
                        }
                    }
                    Text(footnote)
                        .michaelText(.caption)
                        .foregroundStyle(Color.michael.muted)
                }
                .padding(MichaelSpace.screenGutter)
            }
            .background(MichaelBackground())
            .navigationTitle(String(localized: "tasks.why.title", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "tasks.why.done", bundle: .module)) { dismiss() }
                }
            }
        }
    }

    private func points(_ row: PriorityFormat.Row) -> String {
        guard let points = row.points else { return String(localized: "tasks.why.notUsed", bundle: .module) }
        return String(localized: "tasks.why.points \(points.formatted(.number.precision(.fractionLength(1))))", bundle: .module)
    }

    private var footnote: String {
        let score = item.score.formatted(.number.precision(.fractionLength(1)))
        return item.actionable
            ? String(localized: "tasks.why.footnote \(score)", bundle: .module)
            : String(localized: "tasks.why.footnoteWaiting \(score)", bundle: .module)
    }
}
