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
                .michaelFieldFrame(tone)
        case .longText(let maxLength):
            TextField("", text: text(maxLength: maxLength), axis: .vertical)
                .lineLimit(2...6)
                .michaelFieldFrame(tone)
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
                    .michaelFieldFrame(tone)
                if let unit {
                    Text(unit)
                        .michaelText(.label)
                        .foregroundStyle(Color.michael.muted)
                }
            }
        case .weekdays:
            MichaelWeekdayPicker(selected: Set(form.days(field.name))) { onChange(.days($0.sorted())) }
        }
    }

    private var tone: MichaelFieldFrame.Tone { error != nil ? .error : missing ? .missing : .plain }

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
            .michaelFieldFrame(tone)
        }
    }

    @ViewBuilder private var dateControl: some View {
        if let date = LocalDate(form.text(field.name)) {
            HStack(spacing: MichaelSpace.sm) {
                DatePicker(
                    field.label,
                    selection: Binding(
                        get: { PickerClock.date(date) },
                        set: { onChange(.text(PickerClock.localDate($0).description)) }
                    ),
                    displayedComponents: .date
                )
                .labelsHidden()
                .environment(\.timeZone, PickerClock.timeZone)
                Spacer(minLength: 0)
                if !field.required, isEnabled { clearButton }
            }
            .michaelFieldFrame(tone)
        } else {
            addButton(String(localized: "draft.addDate", bundle: .module)) {
                onChange(.text(PickerClock.today(in: form.timeZone).description))
            }
        }
    }

    @ViewBuilder private var timeControl: some View {
        if let time = LocalTime(form.text(field.name)) {
            HStack(spacing: MichaelSpace.sm) {
                DatePicker(
                    field.label,
                    selection: Binding(
                        get: { PickerClock.date(time) },
                        set: { onChange(.text(PickerClock.localTime($0).description)) }
                    ),
                    displayedComponents: .hourAndMinute
                )
                .labelsHidden()
                .environment(\.timeZone, PickerClock.timeZone)
                Spacer(minLength: 0)
                if !field.required, isEnabled { clearButton }
            }
            .michaelFieldFrame(tone)
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
                .michaelFieldFrame(tone)
        }
        .buttonStyle(.plain)
    }
}
