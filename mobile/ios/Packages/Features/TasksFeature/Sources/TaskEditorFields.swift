import DesignSystem
import Models
import SwiftUI

/// A field's label, an optional character count, the control and the reason it was refused.
struct LabeledField<Control: View>: View {
    let label: String
    var count: (Int, Int)?
    let message: String?
    @ViewBuilder let control: () -> Control

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            HStack {
                Text(label)
                    .foregroundStyle(message == nil ? Color.michael.muted : Color.michael.danger)
                Spacer(minLength: MichaelSpace.sm)
                if let (used, limit) = count, used > 0 {
                    Text(String(localized: "tasks.editor.count \(used) \(limit)", bundle: .module))
                        .foregroundStyle(used >= limit ? Color.michael.warn : Color.michael.faint)
                        .monospacedDigit()
                }
            }
            .michaelText(.label)
            .accessibilityHidden(true)
            control()
                .accessibilityHint(message ?? "")
            if let message {
                Text(message)
                    .michaelText(.caption)
                    .foregroundStyle(Color.michael.danger)
                    .accessibilityHidden(true)
            }
        }
    }
}

/// A calendar date that may be empty. The picker runs on a UTC clock so it shows the date as written.
struct OptionalDateField: View {
    let label: String
    @Binding var date: LocalDate?
    let start: () -> LocalDate
    let addTitle: String
    let clearLabel: String
    var tone = MichaelFieldFrame.Tone.plain

    var body: some View {
        if let value = date {
            HStack(spacing: MichaelSpace.sm) {
                DatePicker(
                    label, selection: Binding(get: { PickerClock.date(value) }, set: { date = PickerClock.localDate($0) }),
                    displayedComponents: .date
                )
                .labelsHidden()
                .environment(\.timeZone, PickerClock.timeZone)
                Spacer(minLength: 0)
                Button {
                    date = nil
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(Color.michael.faint)
                        .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(clearLabel)
            }
            .michaelFieldFrame(tone)
        } else {
            Button {
                date = start()
            } label: {
                Text(addTitle)
                    .foregroundStyle(Color.michael.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .michaelFieldFrame(tone)
            }
            .buttonStyle(.plain)
        }
    }
}

struct RepeatField: View {
    let model: TaskEditorModel

    private var draft: RepeatDraft { model.form.repeatRule }

    var body: some View {
        LabeledField(label: String(localized: "tasks.editor.repeat", bundle: .module), message: model.message(for: .recurrence)) {
            VStack(alignment: .leading, spacing: MichaelSpace.sm) {
                Menu {
                    ForEach(RepeatDraft.Preset.allCases, id: \.self) { preset in
                        Button(title(preset)) { model.edit { $0.repeatRule.preset = preset } }
                    }
                } label: {
                    HStack {
                        Text(title(draft.preset)).foregroundStyle(Color.michael.text)
                        Spacer(minLength: MichaelSpace.sm)
                        Image(systemName: "chevron.up.chevron.down")
                            .foregroundStyle(Color.michael.muted)
                            .accessibilityHidden(true)
                    }
                    .michaelFieldFrame(model.message(for: .recurrence) == nil ? .plain : .error)
                }
                .accessibilityLabel(String(localized: "tasks.editor.repeat", bundle: .module))
                .accessibilityValue(title(draft.preset))
                if draft.preset == .custom { custom }
                if let rule = draft.rule(dueDate: model.form.dueDate), model.form.dueDate != nil || draft.preset == .custom {
                    Label(TaskFormat.repeatSummary(rule), systemImage: "repeat")
                        .michaelText(.caption)
                        .foregroundStyle(Color.michael.muted)
                }
                if draft.preset != .none {
                    Text(String(localized: "tasks.editor.repeat.hint", bundle: .module))
                        .michaelText(.caption)
                        .foregroundStyle(Color.michael.faint)
                }
            }
        }
    }

    @ViewBuilder private var custom: some View {
        HStack(spacing: MichaelSpace.sm) {
            Stepper(
                String(localized: "tasks.editor.repeat.every \(draft.interval)", bundle: .module),
                value: Binding(get: { draft.interval }, set: { value in model.edit { $0.repeatRule.interval = value } }),
                in: RepeatDraft.intervals
            )
            .michaelText(.body)
            .foregroundStyle(Color.michael.text)
        }
        MichaelSegmentedControl(
            selection: Binding(get: { draft.frequency }, set: { value in model.edit { $0.repeatRule.frequency = value } }),
            options: [RecurrenceFrequency.daily, .weekly, .monthly],
            title: { unit($0) }
        )
        switch draft.frequency {
        case .weekly:
            MichaelWeekdayPicker(selected: draft.weekdays) { days in model.edit { $0.repeatRule.weekdays = days } }
        case .monthly:
            Stepper(
                String(localized: "tasks.editor.repeat.monthDay \(draft.monthDay)", bundle: .module),
                value: Binding(get: { draft.monthDay }, set: { value in model.edit { $0.repeatRule.monthDay = value } }),
                in: RepeatDraft.monthDays
            )
            .michaelText(.body)
            .foregroundStyle(Color.michael.text)
            Text(String(localized: "tasks.editor.repeat.shortMonth", bundle: .module))
                .michaelText(.caption)
                .foregroundStyle(Color.michael.faint)
        case .daily, .unknown:
            EmptyView()
        }
        Text(String(localized: "tasks.editor.repeat.ends", bundle: .module))
            .michaelText(.label)
            .foregroundStyle(Color.michael.muted)
        OptionalDateField(
            label: String(localized: "tasks.editor.repeat.ends", bundle: .module),
            date: Binding(get: { draft.endsOn }, set: { value in model.edit { $0.repeatRule.endsOn = value } }),
            start: { model.form.dueDate ?? model.today ?? PickerClock.today(in: model.timeZone) },
            addTitle: String(localized: "tasks.editor.repeat.ends.add", bundle: .module),
            clearLabel: String(localized: "tasks.editor.repeat.ends.clear", bundle: .module)
        )
    }

    private func title(_ preset: RepeatDraft.Preset) -> String {
        let due = model.form.dueDate
        switch preset {
        case .none: return String(localized: "tasks.repeat.none", bundle: .module)
        case .daily: return String(localized: "tasks.repeat.daily", bundle: .module)
        case .weekdays: return String(localized: "tasks.repeat.weekdays", bundle: .module)
        case .weekly:
            guard let due else { return String(localized: "tasks.repeat.weekly", bundle: .module) }
            return String(localized: "tasks.repeat.weeklyOn \(TaskFormat.weekdayName(due.weekday))", bundle: .module)
        case .monthly:
            guard let due else { return String(localized: "tasks.repeat.monthly", bundle: .module) }
            return String(localized: "tasks.repeat.monthlyOn \(due.day)", bundle: .module)
        case .custom: return String(localized: "tasks.repeat.custom", bundle: .module)
        }
    }

    private func unit(_ frequency: RecurrenceFrequency) -> String {
        switch frequency {
        case .daily, .unknown: String(localized: "tasks.repeat.unit.days", bundle: .module)
        case .weekly: String(localized: "tasks.repeat.unit.weeks", bundle: .module)
        case .monthly: String(localized: "tasks.repeat.unit.months", bundle: .module)
        }
    }
}

struct ReminderField: View {
    let model: TaskEditorModel

    var body: some View {
        LabeledField(label: String(localized: "tasks.editor.reminder", bundle: .module), message: model.message(for: .reminder)) {
            VStack(alignment: .leading, spacing: MichaelSpace.sm) {
                if let date = model.form.reminderDate {
                    HStack(spacing: MichaelSpace.sm) {
                        DatePicker(
                            String(localized: "tasks.editor.reminder.date", bundle: .module),
                            selection: Binding(
                                get: { PickerClock.date(date) },
                                set: { value in model.edit { $0.reminderDate = PickerClock.localDate(value) } }
                            ),
                            displayedComponents: .date
                        )
                        .labelsHidden()
                        DatePicker(
                            String(localized: "tasks.editor.reminder.time", bundle: .module),
                            selection: Binding(
                                get: { PickerClock.date(model.form.reminderTime ?? LocalTime(hour: 9, minute: 0)) },
                                set: { value in model.edit { $0.reminderTime = PickerClock.localTime(value) } }
                            ),
                            displayedComponents: .hourAndMinute
                        )
                        .labelsHidden()
                        Spacer(minLength: 0)
                        Button {
                            model.edit {
                                $0.reminderDate = nil
                                $0.reminderTime = nil
                            }
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(Color.michael.faint)
                                .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(String(localized: "tasks.editor.reminder.clear", bundle: .module))
                    }
                    .environment(\.timeZone, PickerClock.timeZone)
                    .michaelFieldFrame(model.message(for: .reminder) == nil ? .plain : .error)
                } else {
                    Button {
                        model.edit {
                            $0.reminderDate = $0.dueDate ?? model.today ?? PickerClock.today(in: model.timeZone)
                            $0.reminderTime = LocalTime(hour: 9, minute: 0)
                        }
                    } label: {
                        Text(String(localized: "tasks.editor.reminder.add", bundle: .module))
                            .foregroundStyle(Color.michael.muted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .michaelFieldFrame()
                    }
                    .buttonStyle(.plain)
                }
                if let task = model.task, task.reminderSent, model.form.reminderDate == nil {
                    Text(String(localized: "tasks.editor.reminder.sent", bundle: .module))
                        .michaelText(.caption)
                        .foregroundStyle(Color.michael.muted)
                }
                Text(String(localized: "tasks.editor.reminder.zone \(model.timeZone)", bundle: .module))
                    .michaelText(.caption)
                    .foregroundStyle(Color.michael.faint)
            }
        }
    }
}
