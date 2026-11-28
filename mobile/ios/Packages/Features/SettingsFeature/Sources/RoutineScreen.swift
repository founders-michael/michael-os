import DesignSystem
import Models
import SwiftUI

/// The onboarding answers, editable: time zone, sleep, work, priorities, focus and planning style.
struct RoutineScreen: View {
    @State private var model: RoutineEditorModel
    let onSaved: () -> Void
    @State private var choosingZone = false
    @State private var typedPriority = ""
    @State private var priorityProblem: RoutineForm.PriorityProblem?
    @Environment(\.dismiss) private var dismiss

    init(model: @autoclosure () -> RoutineEditorModel, onSaved: @escaping () -> Void) {
        _model = State(initialValue: model())
        self.onSaved = onSaved
    }

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MichaelBackground())
            .navigationTitle(String(localized: "settings.routine", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    if model.saving {
                        ProgressView()
                    } else {
                        Button(String(localized: "settings.save", bundle: .module)) { _Concurrency.Task { await model.save() } }
                            .disabled(!model.hasChanges || model.form?.workHoursProblem == true)
                    }
                }
            }
            .task { await model.load() }
            .onChange(of: model.saved) { _, saved in
                if saved {
                    onSaved()
                    dismiss()
                }
            }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .loading:
            ProgressView()
        case .failed(let error):
            FailureStateView(message: SettingsFormat.message(error)) { _Concurrency.Task { await model.load() } }
        case .editing:
            if let form = model.form { editor(form) }
        }
    }

    private func binding<Value>(_ keyPath: WritableKeyPath<RoutineForm, Value>, _ form: RoutineForm) -> Binding<Value> {
        Binding(
            get: { model.form?[keyPath: keyPath] ?? form[keyPath: keyPath] },
            set: { value in model.edit { $0[keyPath: keyPath] = value } }
        )
    }

    private func editor(_ form: RoutineForm) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MichaelSpace.lg) {
                if let failure = model.failure { ErrorBanner(message: SettingsFormat.message(failure)) }
                zone(form)
                group(text("settings.routine.sleep")) {
                    TimeRow(label: text("settings.routine.wake"), time: binding(\.wakeUpTime, form))
                    TimeRow(label: text("settings.routine.bed"), time: binding(\.bedtime, form))
                }
                work(form)
                priorities(form)
                group(text("settings.routine.focus")) {
                    minutes(text("settings.routine.session"), binding(\.focusSessionMinutes, form), RoutineForm.focusRange)
                    minutes(text("settings.routine.break"), binding(\.breakDurationMinutes, form), RoutineForm.breakRange)
                    Text(text("settings.routine.style")).michaelText(.label).foregroundStyle(Color.michael.muted)
                    MichaelSegmentedControl(
                        selection: binding(\.planningStyle, form), options: [.structured, .balanced, .flexible], title: SettingsFormat.style
                    )
                }
            }
            .padding(.horizontal, MichaelSpace.screenGutter)
            .padding(.bottom, MichaelSpace.xl)
        }
        .scrollDismissesKeyboard(.interactively)
        .sheet(isPresented: $choosingZone) {
            MichaelTimeZonePicker(
                selection: binding(\.timeZone, form),
                title: text("settings.routine.zone"),
                searchPrompt: text("settings.routine.zone.search"),
                cancel: text("settings.cancel")
            )
        }
    }

    private func zone(_ form: RoutineForm) -> some View {
        group(text("settings.routine.zone")) {
            Button {
                choosingZone = true
            } label: {
                HStack {
                    Text(form.timeZone).foregroundStyle(Color.michael.text)
                    Spacer()
                    Text(MichaelTimeZonePicker.offset(form.timeZone)).foregroundStyle(Color.michael.muted)
                }
                .michaelText(.body)
                .frame(minHeight: MichaelSize.field)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(text("settings.routine.zone"))
            .accessibilityValue(form.timeZone)
            serverError("timeZone")
        }
    }

    private func work(_ form: RoutineForm) -> some View {
        group(text("settings.routine.work")) {
            HStack(spacing: MichaelSpace.xs) {
                ForEach(RoutineForm.week, id: \.self) { day in
                    DayButton(day: day, isOn: form.workDays.contains(day)) { model.edit { $0.toggle(day) } }
                }
            }
            MichaelToggle(text("settings.routine.workHours"), isOn: binding(\.hasWorkHours, form))
            if form.hasWorkHours {
                TimeRow(label: text("settings.routine.workStart"), time: binding(\.workStartTime, form))
                TimeRow(label: text("settings.routine.workEnd"), time: binding(\.workEndTime, form))
                if form.workHoursProblem { problemText(text("settings.routine.workHours.problem")) }
            }
            serverError("workEndTime")
            serverError("workDays")
        }
    }

    private func priorities(_ form: RoutineForm) -> some View {
        group(text("settings.routine.priorities")) {
            ForEach(form.priorities, id: \.self) { priority in
                HStack {
                    Text(priority).michaelText(.body).foregroundStyle(Color.michael.text)
                    Spacer()
                    Button {
                        model.edit { $0.priorities.removeAll { $0 == priority } }
                    } label: {
                        Image(systemName: "xmark")
                            .foregroundStyle(Color.michael.muted)
                            .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(String(localized: "settings.routine.priority.remove \(priority)", bundle: .module))
                }
            }
            if form.priorities.count < RoutineForm.priorityLimit {
                MichaelTextField(
                    text("settings.routine.priority.add"), text: $typedPriority, error: priorityProblem.map(SettingsFormat.priorityProblem)
                )
                .submitLabel(.done)
                .onSubmit(addPriority)
                .onChange(of: typedPriority) { priorityProblem = nil }
            }
            serverError("priorities")
        }
    }

    private func text(_ key: String.LocalizationValue) -> String {
        String(localized: key, bundle: .module)
    }

    private func addPriority() {
        var problem: RoutineForm.PriorityProblem?
        model.edit { problem = $0.addPriority(typedPriority) }
        priorityProblem = problem
        if problem == nil { typedPriority = "" }
    }

    private func group(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: MichaelSpace.sm) {
            Text(title).michaelText(.eyebrow).foregroundStyle(Color.michael.muted).accessibilityAddTraits(.isHeader)
            content()
        }
    }

    private func minutes(_ label: String, _ value: Binding<Int>, _ range: ClosedRange<Int>) -> some View {
        Stepper(value: value, in: range, step: RoutineForm.minuteStep) {
            HStack {
                Text(label).michaelText(.body).foregroundStyle(Color.michael.text)
                Spacer()
                Text(String(localized: "settings.routine.minutes \(value.wrappedValue)", bundle: .module))
                    .michaelText(.label)
                    .foregroundStyle(Color.michael.muted)
                    .monospacedDigit()
            }
        }
        .tint(Color.michael.accent)
        .frame(minHeight: MichaelSize.field)
    }

    @ViewBuilder private func serverError(_ field: String) -> some View {
        if let message = model.serverErrors[field] { problemText(message) }
    }

    private func problemText(_ text: String) -> some View {
        Text(text).michaelText(.caption).foregroundStyle(Color.michael.danger)
    }
}

/// A wall-clock time; the picker runs on a UTC clock so it shows the time as written whatever the device's zone.
struct TimeRow: View {
    let label: String
    @Binding var time: LocalTime

    var body: some View {
        HStack {
            Text(label).michaelText(.body).foregroundStyle(Color.michael.text)
            Spacer()
            DatePicker(
                label,
                selection: Binding(get: { PickerClock.date(time) }, set: { time = PickerClock.localTime($0) }),
                displayedComponents: .hourAndMinute
            )
            .labelsHidden()
            .environment(\.timeZone, PickerClock.timeZone)
            .tint(Color.michael.accent)
        }
        .frame(minHeight: MichaelSize.field)
    }
}

private struct DayButton: View {
    let day: DayOfWeek
    let isOn: Bool
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            Text(SettingsFormat.initial(day))
                .michaelText(.button)
                .foregroundStyle(isOn ? Color.michael.onfill : Color.michael.muted)
                .frame(maxWidth: .infinity, minHeight: MichaelSize.button)
                .background(isOn ? Color.michael.fill : Color.clear, in: RoundedRectangle(cornerRadius: MichaelRadius.button))
                .overlay {
                    RoundedRectangle(cornerRadius: MichaelRadius.button).strokeBorder(isOn ? Color.clear : Color.michael.border2)
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(SettingsFormat.weekday(day))
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}
