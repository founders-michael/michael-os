import DesignSystem
import Models
import Repositories
import SwiftUI

/// Where the review sends the user.
public struct ReviewActions {
    /// Opens Michael with a request filled in. It is never sent on the user's behalf.
    let ask: (String) -> Void
    /// A task moved here; My Day and Tasks reload.
    let changed: () -> Void

    public init(ask: @escaping (String) -> Void, changed: @escaping () -> Void) {
        self.ask = ask
        self.changed = changed
    }
}

/// The Daily Review, pushed from More.
public struct ReviewScreen: View {
    private let reviews: any ReviewRepository
    private let actions: ReviewActions

    public init(reviews: any ReviewRepository, actions: ReviewActions) {
        self.reviews = reviews
        self.actions = actions
    }

    public var body: some View {
        ReviewHost(model: ReviewModel(reviews: reviews), actions: actions)
    }
}

private struct MoveRequest: Identifiable {
    let task: Task
    var id: Task.ID { task.id }
}

private struct ReviewHost: View {
    @State private var model: ReviewModel
    let actions: ReviewActions
    @State private var picking: MoveRequest?
    @Environment(\.scenePhase) private var scenePhase

    init(model: @autoclosure () -> ReviewModel, actions: ReviewActions) {
        _model = State(initialValue: model())
        self.actions = actions
    }

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MichaelBackground())
            .navigationTitle(String(localized: "review.title", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .primaryAction) { SaveBadge(state: model.saveState) }
            }
            .task { await model.load() }
            .onChange(of: scenePhase) { _, phase in
                if phase != .active { _Concurrency.Task { await model.flush() } }
            }
            .onDisappear { _Concurrency.Task { await model.flush() } }
            .sheet(item: $picking) { request in
                if let review = model.review, let today = model.today {
                    CarryForwardSheet(task: request.task, review: review.date, today: today) { form in
                        _Concurrency.Task {
                            await model.carryForward(request.task.id, form)
                            if model.moved[request.task.id] != nil { actions.changed() }
                        }
                    }
                }
            }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            ProgressView().accessibilityLabel(String(localized: "review.loading", bundle: .module))
        case .failed(let error):
            FailureStateView(message: ReviewFormat.message(error)) { _Concurrency.Task { await model.load() } }
        case .content(let review):
            page(review)
        }
    }

    private func page(_ review: DailyReview) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: MichaelSpace.lg) {
                DateBar(date: review.date) { offset in _Concurrency.Task { await model.show(days: offset) } }
                Overview(review: review)
                LineCard(review: review, ask: actions.ask)
                missed(review)
                TaskSection(
                    title: String(localized: "review.planned", bundle: .module), total: review.plannedTasks.count,
                    empty: String(localized: "review.planned.empty", bundle: .module)
                ) {
                    ForEach(review.plannedTasks) { entry in
                        TaskLine(title: entry.task.title, detail: ReviewFormat.status(entry.statusAtSelectedDate))
                    }
                }
                TaskSection(
                    title: String(localized: "review.completed", bundle: .module), total: review.completedTasks.count,
                    empty: String(localized: "review.completed.empty", bundle: .module)
                ) {
                    ForEach(Array(review.completedTasks.enumerated()), id: \.offset) { _, entry in
                        TaskLine(title: entry.task.title, detail: ReviewFormat.clock(entry.completedAt, zone: review.timeZone))
                    }
                }
                TimeCard(time: review.time)
                tomorrow(review)
                WeekCard(week: review.weekly)
                ReflectionFields(model: model)
            }
            .padding(.horizontal, MichaelSpace.screenGutter)
            .padding(.bottom, MichaelSpace.xl)
        }
        .scrollDismissesKeyboard(.interactively)
        .refreshable {
            await model.flush()
            await model.load()
        }
    }

    private func missed(_ review: DailyReview) -> some View {
        TaskSection(
            title: String(localized: "review.missed", bundle: .module), total: review.missedTasks.count,
            empty: String(localized: "review.missed.empty", bundle: .module)
        ) {
            ForEach(review.missedTasks) { entry in
                MissedRow(
                    entry: entry, model: model,
                    onTomorrow: {
                        guard let today = model.today else { return }
                        let date = CarryForwardForm.earliest(review: review.date, today: today)
                        _Concurrency.Task {
                            await model.carryForward(entry.id, CarryForwardForm(date: date))
                            if model.moved[entry.id] != nil { actions.changed() }
                        }
                    },
                    onPick: { picking = MoveRequest(task: entry.task) },
                    onUnschedule: {
                        _Concurrency.Task {
                            await model.unschedule(entry.id)
                            if model.moved[entry.id] != nil { actions.changed() }
                        }
                    }
                )
            }
        }
    }

    private func tomorrow(_ review: DailyReview) -> some View {
        TaskSection(
            title: String(localized: "review.tomorrow \(ReviewFormat.day(review.tomorrow.date))", bundle: .module),
            total: review.tomorrow.incompleteTasks.count, empty: String(localized: "review.tomorrow.empty", bundle: .module)
        ) {
            ForEach(review.tomorrow.incompleteTasks) { task in
                TaskLine(title: task.title, detail: model.moved[task.id].map(ReviewFormat.moved) ?? "")
            }
        }
    }
}

private struct SaveBadge: View {
    let state: SaveState

    var body: some View {
        switch state {
        case .saving:
            ProgressView().accessibilityLabel(String(localized: "review.save.saving", bundle: .module))
        case .saved:
            badge(String(localized: "review.save.saved", bundle: .module), Color.michael.muted)
        case .unsaved:
            badge(String(localized: "review.save.unsaved", bundle: .module), Color.michael.faint)
        case .failed:
            badge(String(localized: "review.save.failed", bundle: .module), Color.michael.danger)
        }
    }

    private func badge(_ text: String, _ color: Color) -> some View {
        Text(text).michaelText(.label).foregroundStyle(color)
    }
}

private struct DateBar: View {
    let date: LocalDate
    let onMove: (Int) -> Void

    var body: some View {
        HStack {
            Button {
                onMove(-1)
            } label: {
                Image(systemName: "chevron.left").frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
            }
            .accessibilityLabel(String(localized: "review.previous", bundle: .module))
            Spacer()
            Text(ReviewFormat.longDay(date))
                .michaelText(.heading)
                .foregroundStyle(Color.michael.text)
                .accessibilityAddTraits(.isHeader)
            Spacer()
            Button {
                onMove(1)
            } label: {
                Image(systemName: "chevron.right").frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
            }
            .accessibilityLabel(String(localized: "review.next", bundle: .module))
        }
        .foregroundStyle(Color.michael.atext)
    }
}

private struct Overview: View {
    let review: DailyReview

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.sm) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: MichaelSpace.sm) { tiles }
                VStack(spacing: MichaelSpace.sm) { tiles }
            }
            MichaelProgressBar(value: Double(review.overview.completionPercent) / 100)
            Text(String(localized: "review.percent \(review.overview.completionPercent)", bundle: .module))
                .michaelText(.caption)
                .foregroundStyle(Color.michael.muted)
        }
    }

    @ViewBuilder private var tiles: some View {
        StatTile(value: "\(review.overview.planned)", label: String(localized: "review.stat.planned", bundle: .module))
        StatTile(
            value: "\(review.overview.completed)", label: String(localized: "review.stat.completed", bundle: .module), isHighlighted: true)
        StatTile(value: "\(review.missedTasks.count)", label: String(localized: "review.stat.missed", bundle: .module))
    }
}

/// Michael's line: computed from the review, its actions fill Michael's composer.
private struct LineCard: View {
    let review: DailyReview
    let ask: (String) -> Void

    var body: some View {
        AICard {
            HStack(alignment: .top, spacing: MichaelSpace.sm) {
                MichaelOrb(size: .small).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: MichaelSpace.sm) {
                    Text(ReviewFormat.line(ReviewLine(review))).michaelText(.body).foregroundStyle(Color.michael.text)
                    let date = review.date.description
                    if !review.missedTasks.isEmpty {
                        MichaelButton(String(localized: "review.line.plan", bundle: .module), size: .small) {
                            ask(
                                review.missedTasks.count == 1
                                    ? String(localized: "review.line.plan.prompt.one \(date)", bundle: .module)
                                    : String(localized: "review.line.plan.prompt.other \(date)", bundle: .module))
                        }
                    }
                    MichaelButton(String(localized: "review.line.talk", bundle: .module), style: .secondary, size: .small) {
                        ask(String(localized: "review.line.talk.prompt \(date)", bundle: .module))
                    }
                }
            }
        }
    }
}

private struct TaskSection<Rows: View>: View {
    let title: String
    let total: Int
    let empty: String
    @ViewBuilder let rows: Rows

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(title).michaelText(.eyebrow).foregroundStyle(Color.michael.muted).accessibilityAddTraits(.isHeader)
                Spacer()
                Text("\(total)").michaelText(.caption).foregroundStyle(Color.michael.muted).monospacedDigit()
            }
            .padding(.bottom, MichaelSpace.xs)
            if total < 1 {
                Text(empty).michaelText(.body).foregroundStyle(Color.michael.faint).padding(.vertical, MichaelSpace.sm)
            } else {
                rows
            }
        }
    }
}

private struct TaskLine: View {
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).michaelText(.body).foregroundStyle(Color.michael.text).frame(maxWidth: .infinity, alignment: .leading)
            Text(detail).michaelText(.caption).foregroundStyle(Color.michael.muted)
        }
        .padding(.vertical, MichaelSpace.sm)
        .overlay(alignment: .bottom) { Divider().overlay(Color.michael.border) }
        .accessibilityElement(children: .combine)
    }
}

/// A missed task: move it, keep it unscheduled, or mark it skipped on purpose.
private struct MissedRow: View {
    let entry: ReviewTask
    let model: ReviewModel
    let onTomorrow: () -> Void
    let onPick: () -> Void
    let onUnschedule: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.sm) {
            HStack(alignment: .firstTextBaseline) {
                Text(entry.task.title).michaelText(.body).foregroundStyle(Color.michael.text).frame(
                    maxWidth: .infinity, alignment: .leading)
                if entry.overdueAtSelectedDate { MichaelChip(String(localized: "review.overdue", bundle: .module), tone: .warn) }
            }
            if let moved = model.moved[entry.id] {
                Text(ReviewFormat.moved(moved)).michaelText(.caption).foregroundStyle(Color.michael.atext)
            } else {
                actions
            }
            if let problem = model.moveProblems[entry.id] {
                Text(ReviewFormat.message(problem)).michaelText(.caption).foregroundStyle(Color.michael.danger)
            }
        }
        .padding(.vertical, MichaelSpace.sm)
        .overlay(alignment: .bottom) { Divider().overlay(Color.michael.border) }
    }

    private var actions: some View {
        let busy = model.busyTask != nil
        let skipped = model.draft.isSkipped(entry.id)
        return ViewThatFits(in: .horizontal) {
            HStack(spacing: MichaelSpace.sm) { buttons(skipped) }
            VStack(alignment: .leading, spacing: MichaelSpace.sm) { buttons(skipped) }
        }
        .disabled(busy)
    }

    @ViewBuilder private func buttons(_ skipped: Bool) -> some View {
        MichaelButton(String(localized: "review.move.tomorrow", bundle: .module), size: .small, action: onTomorrow)
        MichaelButton(String(localized: "review.move.pick", bundle: .module), style: .secondary, size: .small, action: onPick)
        MichaelButton(
            skipped ? String(localized: "review.skipped", bundle: .module) : String(localized: "review.skip", bundle: .module),
            style: .ghost, size: .small
        ) { model.toggleSkipped(entry.id) }
        .accessibilityValue(skipped ? String(localized: "review.skipped.on", bundle: .module) : "")
        MichaelButton(String(localized: "review.unschedule", bundle: .module), style: .ghost, size: .small, action: onUnschedule)
    }
}
