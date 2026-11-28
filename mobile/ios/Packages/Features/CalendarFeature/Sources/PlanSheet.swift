import DesignSystem
import Models
import SwiftUI

/// Ask Michael's planner for sessions over a few days, untick the ones not wanted, and apply the rest. Nothing reaches
/// the calendar until Apply; closing keeps the plan on the day view until it is applied or discarded.
struct PlanSheet: View {
    @State private var model: PlanModel
    let onOpenAvailability: () -> Void
    let onApplied: () -> Void
    @Environment(\.dismiss) private var dismiss

    init(model: @autoclosure () -> PlanModel, onOpenAvailability: @escaping () -> Void, onApplied: @escaping () -> Void) {
        _model = State(initialValue: model())
        self.onOpenAvailability = onOpenAvailability
        self.onApplied = onApplied
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: MichaelSpace.lg) {
                    switch model.step {
                    case .choosing: choosing
                    case .asking: working(String(localized: "calendar.plan.asking", bundle: .module))
                    case .reviewing, .applying: reviewing
                    case .applied(let count): applied(count)
                    case .failed(let problem): failed(problem)
                    }
                }
                .padding(MichaelSpace.screenGutter)
            }
            .background(MichaelBackground())
            .navigationTitle(String(localized: "calendar.plan.title", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "calendar.sheet.close", bundle: .module)) { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom) { footer }
        }
        .interactiveDismissDisabled(model.step == .applying)
        .onChange(of: model.step) { _, step in
            if case .applied = step { onApplied() }
        }
    }

    private var choosing: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.lg) {
            intro(String(localized: "calendar.plan.choose", bundle: .module))
            datePicker(String(localized: "calendar.plan.from", bundle: .module), $model.range.first, in: model.today...)
            datePicker(
                String(localized: "calendar.plan.to", bundle: .module), $model.range.last, in: model.range.first...model.range.latestLast)
            Text(String(localized: "calendar.plan.zone \(model.clock.zone)", bundle: .module)).michaelText(.caption).foregroundStyle(
                Color.michael.faint)
        }
    }

    private func datePicker(_ label: String, _ date: Binding<LocalDate>, in range: PartialRangeFrom<LocalDate>) -> some View {
        DatePicker(
            label, selection: Binding(get: { PickerClock.date(date.wrappedValue) }, set: { date.wrappedValue = PickerClock.localDate($0) }),
            in: PickerClock.date(range.lowerBound)..., displayedComponents: .date
        )
        .environment(\.timeZone, PickerClock.timeZone)
        .michaelText(.body)
        .foregroundStyle(Color.michael.text)
        .michaelFieldFrame()
    }

    private func datePicker(_ label: String, _ date: Binding<LocalDate>, in range: ClosedRange<LocalDate>) -> some View {
        DatePicker(
            label, selection: Binding(get: { PickerClock.date(date.wrappedValue) }, set: { date.wrappedValue = PickerClock.localDate($0) }),
            in: PickerClock.date(range.lowerBound)...PickerClock.date(range.upperBound), displayedComponents: .date
        )
        .environment(\.timeZone, PickerClock.timeZone)
        .michaelText(.body)
        .foregroundStyle(Color.michael.text)
        .michaelFieldFrame()
    }

    private func working(_ text: String) -> some View {
        HStack(spacing: MichaelSpace.md) {
            MichaelOrb(activity: .thinking, size: .small).accessibilityHidden(true)
            Text(text).michaelText(.body).foregroundStyle(Color.michael.muted)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var reviewing: some View {
        if let review = model.review {
            if review.sessions.isEmpty {
                intro(String(localized: "calendar.plan.none", bundle: .module))
            } else {
                intro(String(localized: "calendar.plan.found \(review.sessions.count)", bundle: .module))
                VStack(spacing: 0) {
                    ForEach(review.sessions) { session in
                        sessionRow(session, review: review)
                    }
                }
            }
            if review.needsAvailability {
                notice(
                    String(localized: "calendar.plan.needsAvailability", bundle: .module),
                    action: (
                        String(localized: "calendar.noAvailability.action", bundle: .module),
                        {
                            dismiss()
                            onOpenAvailability()
                        }
                    ))
            }
            ForEach(Array(review.notPlaced.enumerated()), id: \.offset) { _, entry in
                notice(
                    entry.title.map { String(localized: "calendar.plan.notPlaced \($0) \(entry.reason)", bundle: .module) } ?? entry.reason)
            }
            ForEach(review.notes, id: \.self) { note in notice(note) }
        }
    }

    private func sessionRow(_ session: ProposedSession, review: PlanReview) -> some View {
        let title = review.title(session.taskId) ?? ""
        let when = CalendarFormat.session(session.startAt, session.endAt, model.clock)
        let kept = review.isKept(session)
        return HStack(spacing: MichaelSpace.md) {
            MichaelCheck(isChecked: kept, label: "\(title), \(when)") { model.toggle(session) }
            VStack(alignment: .leading, spacing: MichaelSpace.xs / 2) {
                Text(title).michaelText(.body).foregroundStyle(kept ? Color.michael.text : Color.michael.faint).lineLimit(2)
                Text(when).michaelText(.caption).monospacedDigit().foregroundStyle(Color.michael.muted)
                if session.sessionCount > 1 {
                    Text(String(localized: "calendar.plan.part \(session.sessionIndex) \(session.sessionCount)", bundle: .module))
                        .michaelText(.caption).foregroundStyle(Color.michael.faint)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(minHeight: MichaelSize.button + MichaelSpace.lg)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.michael.border).frame(height: 1) }
    }

    private func applied(_ count: Int) -> some View {
        intro(String(localized: "calendar.plan.applied \(count)", bundle: .module))
    }

    private func failed(_ problem: PlanProblem) -> some View {
        ErrorBanner(message: CalendarFormat.planProblem(problem))
    }

    private func intro(_ text: String) -> some View {
        HStack(alignment: .top, spacing: MichaelSpace.md) {
            MichaelOrb(size: .small).accessibilityHidden(true)
            Text(text).michaelText(.body).foregroundStyle(Color.michael.text).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func notice(_ text: String, action: (String, () -> Void)? = nil) -> some View {
        VStack(alignment: .leading, spacing: MichaelSpace.sm) {
            Label(text, systemImage: "exclamationmark.circle").michaelText(.label).foregroundStyle(Color.michael.warn)
            if let action {
                Button(action.0, action: action.1).michaelText(.label).foregroundStyle(Color.michael.atext)
            }
        }
        .padding(MichaelSpace.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.michael.warnBg, in: RoundedRectangle(cornerRadius: MichaelRadius.stat))
    }

    @ViewBuilder private var footer: some View {
        VStack(spacing: MichaelSpace.xs) {
            switch model.step {
            case .choosing:
                MichaelButton(String(localized: "calendar.plan.ask", bundle: .module)) { _Concurrency.Task { await model.ask() } }
            case .asking:
                EmptyView()
            case .reviewing, .applying:
                if let review = model.review, !review.sessions.isEmpty {
                    if model.step == .applying {
                        ProgressView(String(localized: "calendar.plan.applying", bundle: .module))
                            .frame(maxWidth: .infinity, minHeight: MichaelSize.button)
                    } else {
                        MichaelButton(
                            review.keptCount == 0
                                ? String(localized: "calendar.plan.pickOne", bundle: .module)
                                : String(localized: "calendar.plan.apply \(review.keptCount)", bundle: .module)
                        ) { _Concurrency.Task { await model.apply() } }
                        .disabled(review.keptCount == 0)
                    }
                }
                if model.step == .reviewing {
                    MichaelButton(String(localized: "calendar.plan.again", bundle: .module), style: .ghost) { model.startOver() }
                }
            case .applied:
                MichaelButton(String(localized: "calendar.plan.done", bundle: .module)) { dismiss() }
            case .failed(let problem):
                switch problem {
                case .stale, .refused:
                    MichaelButton(String(localized: "calendar.plan.again", bundle: .module)) { model.startOver() }
                case .unavailable:
                    MichaelButton(String(localized: "calendar.plan.retry", bundle: .module)) {
                        _Concurrency.Task { model.review == nil ? await model.ask() : await model.retryApply() }
                    }
                }
            }
        }
        .padding(.horizontal, MichaelSpace.screenGutter)
        .padding(.bottom, MichaelSpace.sm)
        .background(MichaelBackground())
    }
}
