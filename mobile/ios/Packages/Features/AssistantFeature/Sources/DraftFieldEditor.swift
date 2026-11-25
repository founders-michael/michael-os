import DesignSystem
import Models
import SwiftUI

/// One field of a draft card. Dates and times are calendar values in the draft's time zone, so the pickers run
/// on a UTC clock and never shift them.
struct DraftFieldEditor: View {
    let field: DraftField
    let form: DraftForm
    let missing: Bool
    let error: String?
    let onChange: (DraftValue?) -> Void
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            Text(missing ? String(localized: "draft.needed \(field.label)", bundle: .module) : field.label)
                .michaelText(.label)
                .foregroundStyle(error != nil ? Color.michael.danger : missing ? Color.michael.warn : Color.michael.muted)
                .accessibilityHidden(true)
            control
                .accessibilityLabel(field.label)
                .accessibilityHint(error ?? (missing ? String(localized: "draft.neededHint", bundle: .module) : ""))
            if let error {
                Text(error)
                    .michaelText(.caption)
                    .foregroundStyle(Color.michael.danger)
                    .accessibilityHidden(true)
            }
        }
    }

    @ViewBuilder private var control: some View {
        switch field.input {
        case .text(let maxLength):
            TextField("", text: text(maxLength: maxLength))
                .modifier(FieldFrame(tone: tone))
        case .longText(let maxLength):
            TextField("", text: text(maxLength: maxLength), axis: .vertical)
                .lineLimit(2...6)
                .modifier(FieldFrame(tone: tone))
        case .choice(let options):
            choice(options)
        case .date:
            dateControl
        case .time:
            timeControl
        case .number(_, _, let unit):
            HStack(spacing: MichaelSpace.sm) {
                TextField("", text: number)
                    .keyboardType(.numberPad)
                    .modifier(FieldFrame(tone: tone))
                if let unit {
                    Text(unit)
                        .michaelText(.label)
                        .foregroundStyle(Color.michael.muted)
                }
            }
        case .weekdays:
            WeekdayPicker(selected: form.days(field.name)) { onChange(.days($0)) }
        }
    }

    private var tone: FieldFrame.Tone { error != nil ? .error : missing ? .missing : .plain }

    private func text(maxLength: Int) -> Binding<String> {
        Binding(
            get: { form.text(field.name) },
            set: { value in onChange(value.isEmpty ? nil : .text(String(value.prefix(maxLength)))) }
        )
    }

    private var number: Binding<String> {
        Binding(
            get: { form.number(field.name).map(String.init) ?? "" },
            set: { value in onChange(Int(value.filter(\.isNumber)).map(DraftValue.number)) }
        )
    }

    private func choice(_ options: [DraftOption]) -> some View {
        Menu {
            ForEach(options, id: \.value) { option in
                Button(option.label) { onChange(.text(option.value)) }
            }
        } label: {
            HStack {
                Text(options.first { $0.value == form.text(field.name) }?.label ?? String(localized: "draft.choose", bundle: .module))
                    .foregroundStyle(Color.michael.text)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.up.chevron.down")
                    .foregroundStyle(Color.michael.muted)
                    .accessibilityHidden(true)
            }
            .modifier(FieldFrame(tone: tone))
        }
    }

    @ViewBuilder private var dateControl: some View {
        if let date = LocalDate(form.text(field.name)) {
            HStack(spacing: MichaelSpace.sm) {
                DatePicker(
                    field.label,
                    selection: Binding(
                        get: { CalendarClock.date(date) },
                        set: { onChange(.text(CalendarClock.localDate($0).description)) }
                    ),
                    displayedComponents: .date
                )
                .labelsHidden()
                .environment(\.timeZone, CalendarClock.utc)
                Spacer(minLength: 0)
                if !field.required, isEnabled { clearButton }
            }
            .modifier(FieldFrame(tone: tone))
        } else {
            addButton(String(localized: "draft.addDate", bundle: .module)) {
                onChange(.text(CalendarClock.today(in: form.timeZone).description))
            }
        }
    }

    @ViewBuilder private var timeControl: some View {
        if let time = LocalTime(form.text(field.name)) {
            HStack(spacing: MichaelSpace.sm) {
                DatePicker(
                    field.label,
                    selection: Binding(
                        get: { CalendarClock.date(time) },
                        set: { onChange(.text(CalendarClock.localTime($0).description)) }
                    ),
                    displayedComponents: .hourAndMinute
                )
                .labelsHidden()
                .environment(\.timeZone, CalendarClock.utc)
                Spacer(minLength: 0)
                if !field.required, isEnabled { clearButton }
            }
            .modifier(FieldFrame(tone: tone))
        } else {
            addButton(String(localized: "draft.addTime", bundle: .module)) { onChange(.text("09:00")) }
        }
    }

    private var clearButton: some View {
        Button {
            onChange(nil)
        } label: {
            Image(systemName: "xmark.circle.fill")
                .foregroundStyle(Color.michael.faint)
                .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "draft.clear \(field.label)", bundle: .module))
    }

    private func addButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .foregroundStyle(Color.michael.muted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .modifier(FieldFrame(tone: tone))
        }
        .buttonStyle(.plain)
    }
}

/// The look of a field on a draft card: dashed while a required value is missing, red when refused.
struct FieldFrame: ViewModifier {
    enum Tone {
        case plain, missing, error
    }

    let tone: Tone

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: MichaelRadius.field)
        content
            .michaelText(.body)
            .foregroundStyle(Color.michael.text)
            .tint(Color.michael.accent)
            .padding(.horizontal, MichaelSpace.md)
            .padding(.vertical, MichaelSpace.sm)
            .frame(minHeight: MichaelSize.field)
            .background(Color.michael.solid, in: shape)
            .overlay {
                switch tone {
                case .plain: shape.strokeBorder(Color.michael.border2)
                case .missing: shape.strokeBorder(Color.michael.warn, style: StrokeStyle(lineWidth: 1, dash: [MichaelSpace.xs]))
                case .error: shape.strokeBorder(Color.michael.danger)
                }
            }
    }
}

private struct WeekdayPicker: View {
    let selected: [Int]
    let onChange: ([Int]) -> Void

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: MichaelSize.checkTouch), spacing: MichaelSpace.sm)], spacing: MichaelSpace.sm) {
            ForEach(1...7, id: \.self) { day in
                let isOn = selected.contains(day)
                Button {
                    onChange(isOn ? selected.filter { $0 != day } : (selected + [day]).sorted())
                } label: {
                    Text(CalendarClock.shortWeekday(day))
                        .michaelText(.label)
                        .foregroundStyle(isOn ? Color.michael.onfill : Color.michael.text)
                        .frame(maxWidth: .infinity, minHeight: MichaelSize.checkTouch)
                        .background(isOn ? Color.michael.fill : Color.michael.solid, in: Capsule())
                        .overlay { Capsule().strokeBorder(isOn ? Color.clear : Color.michael.border2) }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(CalendarClock.weekday(day))
                .accessibilityAddTraits(isOn ? .isSelected : [])
            }
        }
    }
}

/// Calendar values on a UTC clock, so a picker shows them as written whatever the device's zone.
enum CalendarClock {
    static let utc = TimeZone(identifier: "UTC") ?? .gmt

    private static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        return calendar
    }

    static func date(_ date: LocalDate) -> Date {
        calendar.date(from: DateComponents(year: date.year, month: date.month, day: date.day, hour: 12)) ?? .now
    }

    static func date(_ time: LocalTime) -> Date {
        calendar.date(from: DateComponents(year: 2001, month: 1, day: 1, hour: time.hour, minute: time.minute)) ?? .now
    }

    static func localDate(_ date: Date) -> LocalDate {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        let text = String(format: "%04d-%02d-%02d", parts.year ?? 2000, parts.month ?? 1, parts.day ?? 1)
        return LocalDate(text) ?? CalendarClock.today(in: "UTC")
    }

    static func localTime(_ date: Date) -> LocalTime {
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return LocalTime(hour: parts.hour ?? 0, minute: parts.minute ?? 0)
    }

    /// Only a starting value for a picker the user then sets: the server's date rules everything else.
    static func today(in zone: String) -> LocalDate {
        var zoned = Calendar(identifier: .gregorian)
        zoned.timeZone = TimeZone(identifier: zone) ?? .current
        let parts = zoned.dateComponents([.year, .month, .day], from: .now)
        let text = String(format: "%04d-%02d-%02d", parts.year ?? 2000, parts.month ?? 1, parts.day ?? 1)
        return LocalDate(text) ?? localDate(.now)
    }

    /// ISO weekday, 1 for Monday.
    static func shortWeekday(_ day: Int) -> String {
        Calendar.current.shortStandaloneWeekdaySymbols[day % 7]
    }

    static func weekday(_ day: Int) -> String {
        Calendar.current.standaloneWeekdaySymbols[day % 7]
    }
}
