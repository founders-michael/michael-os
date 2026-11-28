import DesignSystem
import Models
import SwiftUI

/// What the grid draws: a saved event, or a session of the plan under review.
enum GridItem: Timed, Identifiable {
    case event(CalendarEvent)
    case proposed(ProposedSession, title: String, kept: Bool)

    var id: String {
        switch self {
        case .event(let event): "event-\(event.id)"
        case .proposed(let session, _, _): "proposed-\(session.selectionId)"
        }
    }

    var startAt: Date {
        switch self {
        case .event(let event): event.startAt
        case .proposed(let session, _, _): session.startAt
        }
    }

    var endAt: Date {
        switch self {
        case .event(let event): event.endAt
        case .proposed(let session, _, _): session.endAt
        }
    }
}

/// One day of 24 wall-clock hours on the profile's clock, opened an hour before the first item.
struct DayGrid: View {
    let day: LocalDate
    let clock: ZonedClock
    let items: [GridItem]
    let onEdit: (CalendarEvent) -> Void
    let onToggle: (ProposedSession) -> Void

    @ScaledMetric(relativeTo: .body) private var hourHeight = MichaelSize.calendarHour

    var body: some View {
        let placed = DayLayout.place(items, on: day, clock: clock)
        let first = DayLayout.firstMinute(placed.map(\.startMinute))
        ScrollViewReader { reader in
            ScrollView {
                ZStack(alignment: .topLeading) {
                    hours
                    GeometryReader { geometry in
                        let width = max(0, geometry.size.width - MichaelSize.calendarGutter - MichaelSpace.sm)
                        ForEach(placed, id: \.item.id) { entry in
                            block(entry)
                                .frame(
                                    width: max(0, width / CGFloat(entry.columns) - MichaelSpace.xs),
                                    height: max(0, CGFloat(entry.endMinute - entry.startMinute) / 60 * hourHeight - MichaelSpace.xs)
                                )
                                .offset(
                                    x: MichaelSize.calendarGutter + MichaelSpace.sm + width / CGFloat(entry.columns)
                                        * CGFloat(entry.column),
                                    y: CGFloat(entry.startMinute) / 60 * hourHeight + MichaelSpace.xs / 2
                                )
                        }
                        if day == clock.today() {
                            nowLine(width: geometry.size.width)
                        }
                    }
                }
                .frame(height: hourHeight * 24)
            }
            .onAppear { reader.scrollTo(first / 60, anchor: .top) }
            .onChange(of: day) { reader.scrollTo(first / 60, anchor: .top) }
            // Again when the day's first item moves, so an event just added above the view comes into it.
            .onChange(of: first) { reader.scrollTo(first / 60, anchor: .top) }
        }
    }

    private var hours: some View {
        VStack(spacing: 0) {
            ForEach(0..<24, id: \.self) { hour in
                HStack(alignment: .top, spacing: MichaelSpace.sm) {
                    Text(CalendarFormat.hour(hour))
                        .michaelText(.caption)
                        .monospacedDigit()
                        .foregroundStyle(Color.michael.faint)
                        .frame(width: MichaelSize.calendarGutter, alignment: .leading)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .padding(.top, MichaelSpace.xs)
                    Spacer(minLength: 0)
                }
                .frame(height: hourHeight, alignment: .top)
                .overlay(alignment: .top) { Rectangle().fill(Color.michael.border).frame(height: 1) }
                .id(hour)
            }
        }
        .accessibilityHidden(true)
    }

    private func nowLine(width: CGFloat) -> some View {
        let minute = clock.minuteOfDay(.now)
        return HStack(spacing: 0) {
            Circle().fill(Color.michael.accent).frame(width: MichaelSpace.sm, height: MichaelSpace.sm)
            Rectangle().fill(Color.michael.accent).frame(height: 2)
        }
        .frame(width: max(0, width - MichaelSize.calendarGutter))
        .offset(x: MichaelSize.calendarGutter + MichaelSpace.xs, y: CGFloat(minute) / 60 * hourHeight - MichaelSpace.xs)
        .accessibilityHidden(true)
    }

    @ViewBuilder private func block(_ entry: PlacedItem<GridItem>) -> some View {
        switch entry.item {
        case .event(let event):
            Button {
                onEdit(event)
            } label: {
                EventBlock(event: event, clock: clock, short: entry.endMinute - entry.startMinute < 45)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                [event.title, CalendarFormat.range(event.startAt, event.endAt, clock), CalendarFormat.kind(EventKind(event.eventType))]
                    .joined(separator: ", ")
            )
            .accessibilityHint(String(localized: "calendar.event.editHint", bundle: .module))
        case .proposed(let session, let title, let kept):
            Button {
                onToggle(session)
            } label: {
                ProposedBlock(title: title, time: CalendarFormat.range(session.startAt, session.endAt, clock), kept: kept)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(title), \(CalendarFormat.range(session.startAt, session.endAt, clock))")
            .accessibilityValue(
                kept
                    ? String(localized: "calendar.proposed.kept", bundle: .module)
                    : String(localized: "calendar.proposed.dismissed", bundle: .module)
            )
            .accessibilityHint(
                kept
                    ? String(localized: "calendar.proposed.dismiss", bundle: .module)
                    : String(localized: "calendar.proposed.keep", bundle: .module)
            )
        }
    }
}

private struct EventBlock: View {
    let event: CalendarEvent
    let clock: ZonedClock
    let short: Bool

    var body: some View {
        let kind = EventKind(event.eventType)
        VStack(alignment: .leading, spacing: 0) {
            Text(event.title)
                .michaelText(.label)
                .foregroundStyle(kind == .commitment ? Color.michael.info : kind == .unavailable ? Color.michael.muted : Color.michael.text)
                .lineLimit(short ? 1 : 2)
            if !short {
                Text("\(CalendarFormat.range(event.startAt, event.endAt, clock)) · \(CalendarFormat.kind(kind))")
                    .michaelText(.caption)
                    .monospacedDigit()
                    .foregroundStyle(Color.michael.muted)
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, MichaelSpace.md)
        .padding(.vertical, MichaelSpace.xs)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(background(kind), in: RoundedRectangle(cornerRadius: MichaelRadius.button))
        .overlay {
            if kind != .commitment {
                RoundedRectangle(cornerRadius: MichaelRadius.button).strokeBorder(
                    kind == .session ? Color.michael.border2 : Color.michael.border)
            }
        }
        .overlay(alignment: .leading) {
            if kind == .session {
                Rectangle().fill(Color.michael.accent).frame(width: MichaelSpace.xs / 1.5)
                    .clipShape(UnevenRoundedRectangle(topLeadingRadius: MichaelRadius.button, bottomLeadingRadius: MichaelRadius.button))
            }
        }
        .contentShape(Rectangle())
    }

    private func background(_ kind: EventKind) -> Color {
        switch kind {
        case .commitment: Color.michael.infoBg
        case .unavailable, .session: Color.michael.raise
        }
    }
}

private struct ProposedBlock: View {
    let title: String
    let time: String
    let kept: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: MichaelSpace.sm) {
                Text(title)
                    .michaelText(.label)
                    .foregroundStyle(kept ? Color.michael.text : Color.michael.faint)
                    .strikethrough(!kept)
                    .lineLimit(1)
                Spacer(minLength: 0)
                Text(
                    kept
                        ? String(localized: "calendar.proposed.label", bundle: .module)
                        : String(localized: "calendar.proposed.dismissed", bundle: .module)
                )
                .michaelText(.caption)
                .foregroundStyle(kept ? Color.michael.atext : Color.michael.faint)
            }
            Text(time).michaelText(.caption).monospacedDigit().foregroundStyle(Color.michael.muted).lineLimit(1)
        }
        .padding(.horizontal, MichaelSpace.md)
        .padding(.vertical, MichaelSpace.xs)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(kept ? Color.michael.chip : Color.clear, in: RoundedRectangle(cornerRadius: MichaelRadius.button))
        .overlay {
            RoundedRectangle(cornerRadius: MichaelRadius.button)
                .strokeBorder(
                    kept ? Color.michael.chipBorder : Color.michael.border2,
                    style: StrokeStyle(lineWidth: 1.5, dash: [MichaelSpace.xs, MichaelSpace.xs]))
        }
        .contentShape(Rectangle())
    }
}
