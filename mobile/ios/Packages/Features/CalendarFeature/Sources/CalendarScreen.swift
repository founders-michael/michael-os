import DesignSystem
import Models
import Repositories
import SwiftUI

public struct CalendarActions {
    let openAvailability: () -> Void
    let changed: () -> Void

    public init(openAvailability: @escaping () -> Void, changed: @escaping () -> Void) {
        self.openAvailability = openAvailability
        self.changed = changed
    }
}

/// The day view with its week strip. Tasks without a time open from the bar under the grid; "Plan" asks Michael's
/// planner, and the sessions it suggests are drawn dashed until they are applied.
public struct CalendarScreen: View {
    @State private var model: CalendarModel
    @Binding private var incoming: PlanningProposal?
    private let version: Int
    private let calendar: any CalendarRepository
    private let actions: CalendarActions

    @State private var editor: EditorRequest?
    @State private var showsUnscheduled = false
    @State private var showsPlan = false

    public init(calendar: any CalendarRepository, incoming: Binding<PlanningProposal?>, version: Int, actions: CalendarActions) {
        _model = State(initialValue: CalendarModel(calendar: calendar))
        _incoming = incoming
        self.version = version
        self.calendar = calendar
        self.actions = actions
    }

    public var body: some View {
        Group {
            switch model.state {
            case .loading:
                ProgressView(String(localized: "calendar.loading", bundle: .module))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let error):
                FailureStateView(message: CalendarFormat.message(error)) { _Concurrency.Task { await model.load() } }
            case .content:
                if let clock = model.clock, let day = model.day { content(clock: clock, day: day) }
            }
        }
        .background(MichaelBackground())
        .toolbar(.hidden, for: .navigationBar)
        .task { await model.load() }
        .task(id: version) { if version > 0 { await model.reload() } }
        .task(id: incoming) {
            guard let proposal = incoming else { return }
            incoming = nil
            if model.clock == nil { await model.load() }
            await model.startReview(proposal)
            showsPlan = true
        }
        .sheet(item: $editor) { request in
            EventEditorSheet(
                model: EventEditorModel(
                    form: request.form, event: request.event, clock: request.clock, tasks: model.unscheduled, calendar: calendar)
            ) {
                // The bump reloads this screen too, through `version`.
                actions.changed()
            }
        }
        .sheet(isPresented: $showsUnscheduled) {
            if let clock = model.clock, let day = model.day {
                UnscheduledSheet(tasks: model.unscheduled) { task in
                    showsUnscheduled = false
                    editor = EditorRequest(
                        form: EventForm(scheduling: task, on: max(day, clock.today()), clock: clock), event: nil, clock: clock)
                }
            }
        }
        .sheet(isPresented: $showsPlan) {
            if let clock = model.clock {
                PlanSheet(model: PlanModel(owner: model, clock: clock, calendar: calendar), onOpenAvailability: openAvailability) {
                    actions.changed()
                }
            }
        }
    }

    private func content(clock: ZonedClock, day: LocalDate) -> some View {
        VStack(alignment: .leading, spacing: MichaelSpace.md) {
            header(clock: clock, day: day)
            WeekStrip(day: day, today: clock.today()) { date in _Concurrency.Task { await model.show(date) } }
            HStack(spacing: 0) {
                Label(String(localized: "calendar.zone \(clock.zone)", bundle: .module), systemImage: "globe")
                    .michaelText(.caption)
                    .foregroundStyle(Color.michael.muted)
                Spacer(minLength: MichaelSpace.sm)
                weekStep(String(localized: "calendar.week.previous", bundle: .module), symbol: "chevron.left", to: day.adding(days: -7))
                weekStep(String(localized: "calendar.week.next", bundle: .module), symbol: "chevron.right", to: day.adding(days: 7))
            }
            if !model.availabilityConfigured { availabilityNotice }
            if model.truncated {
                Text(String(localized: "calendar.truncated", bundle: .module)).michaelText(.caption).foregroundStyle(Color.michael.warn)
            }
            DayGrid(
                day: day, clock: clock, items: items,
                onEdit: { event in editor = EditorRequest(form: EventForm(event, clock: clock), event: event, clock: clock) },
                onToggle: { session in model.review?.toggle(session) }
            )
            bar
        }
        .padding(.horizontal, MichaelSpace.screenGutter)
        .padding(.top, MichaelSpace.lg)
    }

    private var items: [GridItem] {
        var items = model.events.map(GridItem.event)
        if let review = model.review {
            items += review.sessions.map { session in
                .proposed(session, title: review.title(session.taskId) ?? "", kept: review.isKept(session))
            }
        }
        return items
    }

    private func header(clock: ZonedClock, day: LocalDate) -> some View {
        HStack(alignment: .center, spacing: MichaelSpace.sm) {
            VStack(alignment: .leading, spacing: MichaelSpace.xs) {
                Text(CalendarFormat.month(day)).michaelText(.eyebrow).foregroundStyle(Color.michael.faint)
                Text(CalendarFormat.dayTitle(day))
                    .michaelText(.display)
                    .foregroundStyle(Color.michael.text)
                    .accessibilityAddTraits(.isHeader)
            }
            Spacer(minLength: MichaelSpace.sm)
            Button {
                showsPlan = true
            } label: {
                HStack(spacing: MichaelSpace.sm) {
                    MichaelOrb(size: .small).frame(width: MichaelSpace.lg, height: MichaelSpace.lg).accessibilityHidden(true)
                    Text(String(localized: "calendar.plan", bundle: .module)).michaelText(.button)
                }
                .foregroundStyle(Color.michael.atext)
                .padding(.horizontal, MichaelSpace.md)
                .frame(minHeight: MichaelSize.checkTouch)
                .background(Color.michael.chip, in: RoundedRectangle(cornerRadius: MichaelRadius.button))
                .overlay(RoundedRectangle(cornerRadius: MichaelRadius.button).strokeBorder(Color.michael.chipBorder))
            }
            .buttonStyle(.plain)
            .accessibilityHint(String(localized: "calendar.plan.hint", bundle: .module))
            Button {
                editor = EditorRequest(form: EventForm(on: day, clock: clock), event: nil, clock: clock)
            } label: {
                Image(systemName: "plus")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color.michael.onfill)
                    .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
                    .background(Color.michael.fill, in: RoundedRectangle(cornerRadius: MichaelRadius.button))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "calendar.newEvent", bundle: .module))
        }
    }

    private var availabilityNotice: some View {
        Button(action: openAvailability) {
            HStack(spacing: MichaelSpace.sm) {
                Text(String(localized: "calendar.noAvailability", bundle: .module))
                    .michaelText(.caption)
                    .foregroundStyle(Color.michael.warn)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(String(localized: "calendar.noAvailability.action", bundle: .module)).michaelText(.label).foregroundStyle(
                    Color.michael.atext)
            }
            .padding(MichaelSpace.md)
            .background(Color.michael.warnBg, in: RoundedRectangle(cornerRadius: MichaelRadius.stat))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var bar: some View {
        if let review = model.review {
            HStack(spacing: MichaelSpace.sm) {
                Button {
                    showsPlan = true
                } label: {
                    Text(String(localized: "calendar.bar.review \(review.keptCount)", bundle: .module))
                        .michaelText(.label)
                        .foregroundStyle(Color.michael.atext)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .frame(minHeight: MichaelSize.button)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                MichaelButton(String(localized: "calendar.bar.discard", bundle: .module), style: .ghost, size: .small) {
                    model.review = nil
                }
            }
            .padding(.horizontal, MichaelSpace.md)
            .background(Color.michael.chip, in: RoundedRectangle(cornerRadius: MichaelRadius.stat))
            .overlay(RoundedRectangle(cornerRadius: MichaelRadius.stat).strokeBorder(Color.michael.chipBorder))
            .padding(.bottom, MichaelSpace.sm)
        } else if !model.unscheduled.isEmpty {
            Button {
                showsUnscheduled = true
            } label: {
                HStack {
                    Text(String(localized: "calendar.bar.unscheduled \(model.unscheduled.count)", bundle: .module))
                        .michaelText(.label)
                        .foregroundStyle(Color.michael.text)
                    Spacer()
                    Image(systemName: "chevron.up").foregroundStyle(Color.michael.faint).accessibilityHidden(true)
                }
                .padding(.horizontal, MichaelSpace.md)
                .frame(minHeight: MichaelSize.button)
                .background(Color.michael.solid, in: RoundedRectangle(cornerRadius: MichaelRadius.stat))
                .overlay(RoundedRectangle(cornerRadius: MichaelRadius.stat).strokeBorder(Color.michael.border2))
            }
            .buttonStyle(.plain)
            .padding(.bottom, MichaelSpace.sm)
        }
    }

    private func weekStep(_ label: String, symbol: String, to date: LocalDate) -> some View {
        Button {
            _Concurrency.Task { await model.show(date) }
        } label: {
            Image(systemName: symbol)
                .foregroundStyle(Color.michael.muted)
                .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func openAvailability() {
        showsPlan = false
        actions.openAvailability()
    }
}

struct EditorRequest: Identifiable {
    let id = UUID()
    let form: EventForm
    let event: CalendarEvent?
    let clock: ZonedClock
}

/// Monday to Sunday; a swipe moves a week.
private struct WeekStrip: View {
    let day: LocalDate
    let today: LocalDate
    let onPick: (LocalDate) -> Void

    var body: some View {
        let week = CalendarWeek(containing: day)
        HStack(spacing: MichaelSpace.xs) {
            ForEach(week.days, id: \.self) { date in
                let selected = date == day
                Button {
                    onPick(date)
                } label: {
                    VStack(spacing: MichaelSpace.xs / 2) {
                        Text(CalendarFormat.weekdayShort(date)).michaelText(.caption)
                        Text(CalendarFormat.dayNumber(date)).michaelText(.stat).monospacedDigit()
                    }
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .foregroundStyle(selected ? Color.michael.onfill : date == today ? Color.michael.atext : Color.michael.text)
                    .frame(maxWidth: .infinity, minHeight: MichaelSize.weekDay)
                    .background(selected ? Color.michael.fill : Color.clear, in: RoundedRectangle(cornerRadius: MichaelRadius.button))
                    .overlay {
                        if !selected { RoundedRectangle(cornerRadius: MichaelRadius.button).strokeBorder(Color.michael.border) }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(CalendarFormat.fullDate(date))
                .accessibilityAddTraits(selected ? .isSelected : [])
            }
        }
        .gesture(
            DragGesture(minimumDistance: MichaelSpace.xl).onEnded { drag in
                if drag.translation.width < -MichaelSpace.xxl { onPick(day.adding(days: 7)) }
                if drag.translation.width > MichaelSpace.xxl { onPick(day.adding(days: -7)) }
            }
        )
    }
}
