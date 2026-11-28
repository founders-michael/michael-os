import DesignSystem
import Models
import SwiftUI

/// Create or edit a habit. Closing with unsaved changes asks first; the sheet closes once the server has the habit.
struct HabitEditorSheet: View {
    @State private var model: HabitEditorModel
    let onSaved: (Habit) -> Void
    @State private var confirmingDiscard = false
    @Environment(\.dismiss) private var dismiss

    init(model: @autoclosure () -> HabitEditorModel, onSaved: @escaping (Habit) -> Void) {
        _model = State(initialValue: model())
        self.onSaved = onSaved
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: MichaelSpace.lg) {
                    if let failure = model.failure { ErrorBanner(message: HabitFormat.loadMessage(failure)) }
                    MichaelTextField(
                        String(localized: "habits.editor.name", bundle: .module),
                        text: Binding(get: { model.form.title }, set: { value in model.edit { $0.title = value } }),
                        error: model.serverErrors["title"]
                            ?? (model.showsProblems && model.form.titleMissing
                                ? String(localized: "habits.editor.problem.name", bundle: .module) : nil)
                    )
                    notes
                    schedule
                    times
                }
                .padding(MichaelSpace.screenGutter)
            }
            .background(MichaelBackground())
            .navigationTitle(
                model.habit == nil
                    ? String(localized: "habits.editor.new", bundle: .module) : String(localized: "habits.editor.edit", bundle: .module)
            )
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "habits.editor.cancel", bundle: .module)) {
                        if model.hasChanges { confirmingDiscard = true } else { dismiss() }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if model.saving {
                        ProgressView()
                    } else {
                        Button(String(localized: "habits.editor.save", bundle: .module)) { _Concurrency.Task { await model.save() } }
                    }
                }
            }
            .confirmationDialog(
                String(localized: "habits.editor.discard", bundle: .module), isPresented: $confirmingDiscard, titleVisibility: .visible
            ) {
                Button(String(localized: "habits.editor.discard.confirm", bundle: .module), role: .destructive) { dismiss() }
            }
        }
        .interactiveDismissDisabled(model.hasChanges || model.saving)
        .onChange(of: model.saved) { _, saved in
            if let saved {
                onSaved(saved)
                dismiss()
            }
        }
    }

    private var notes: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            Text(String(localized: "habits.editor.notes", bundle: .module)).michaelText(.label).foregroundStyle(Color.michael.muted)
            TextField("", text: Binding(get: { model.form.notes }, set: { value in model.edit { $0.notes = value } }), axis: .vertical)
                .lineLimit(2...6)
                .accessibilityLabel(String(localized: "habits.editor.notes", bundle: .module))
                .michaelFieldFrame()
        }
    }

    private var schedule: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.sm) {
            Text(String(localized: "habits.editor.often", bundle: .module)).michaelText(.label).foregroundStyle(Color.michael.muted)
            MichaelSegmentedControl(
                selection: Binding(get: { model.form.schedule.frequency }, set: { value in model.edit { $0.schedule.frequency = value } }),
                options: [HabitFrequency.daily, .selectedDays],
                title: {
                    $0 == .daily
                        ? String(localized: "habits.editor.daily", bundle: .module)
                        : String(localized: "habits.editor.days", bundle: .module)
                }
            )
            if model.form.schedule.frequency == .selectedDays {
                MichaelWeekdayPicker(selected: model.form.schedule.weekdays) { days in model.edit { $0.schedule.weekdays = days } }
            }
            if let message = problem(.noWeekday) {
                Text(message).michaelText(.caption).foregroundStyle(Color.michael.danger)
            }
        }
    }

    private var times: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.sm) {
            time(String(localized: "habits.editor.start", bundle: .module), value: model.form.schedule.startTime) { value in
                model.edit { $0.schedule.startTime = value }
            }
            time(String(localized: "habits.editor.end", bundle: .module), value: model.form.schedule.endTime) { value in
                model.edit { $0.schedule.endTime = value }
            }
            if let message = problem(.endWithoutStart) ?? problem(.endEqualsStart) ?? model.serverErrors["endTime"]
                ?? model.serverErrors["startTime"]
            {
                Text(message).michaelText(.caption).foregroundStyle(Color.michael.danger)
            } else if model.form.schedule.runsPastMidnight {
                Text(String(localized: "habits.editor.pastMidnight", bundle: .module)).michaelText(.caption).foregroundStyle(
                    Color.michael.muted)
            } else {
                Text(String(localized: "habits.editor.timesHint", bundle: .module)).michaelText(.caption).foregroundStyle(
                    Color.michael.faint)
            }
        }
    }

    private func time(_ label: String, value: LocalTime?, set: @escaping (LocalTime?) -> Void) -> some View {
        HStack {
            Text(label).michaelText(.body).foregroundStyle(Color.michael.text)
            Spacer(minLength: MichaelSpace.sm)
            if let value {
                DatePicker(
                    label, selection: Binding(get: { PickerClock.date(value) }, set: { set(PickerClock.localTime($0)) }),
                    displayedComponents: .hourAndMinute
                )
                .labelsHidden()
                .environment(\.timeZone, PickerClock.timeZone)
                Button {
                    set(nil)
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(Color.michael.faint)
                        .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "habits.editor.clear \(label)", bundle: .module))
            } else {
                Button(String(localized: "habits.editor.add", bundle: .module)) { set(LocalTime(hour: 7, minute: 0)) }
                    .accessibilityLabel(String(localized: "habits.editor.addLabel \(label)", bundle: .module))
            }
        }
        .michaelFieldFrame()
    }

    private func problem(_ problem: HabitSchedule.Problem) -> String? {
        guard model.showsProblems, model.form.schedule.problem == problem else { return nil }
        return switch problem {
        case .noWeekday: String(localized: "habits.editor.problem.days", bundle: .module)
        case .endWithoutStart: String(localized: "habits.editor.problem.endWithoutStart", bundle: .module)
        case .endEqualsStart: String(localized: "habits.editor.problem.endEqualsStart", bundle: .module)
        }
    }
}

/// Server dates are calendar dates in the profile's zone, shown on a UTC clock so no zone shifts them.
enum HabitFormat {
    static func date(_ date: LocalDate) -> String {
        PickerClock.date(date).formatted(Date.FormatStyle(timeZone: PickerClock.timeZone).day().month(.abbreviated))
    }

    static func time(_ time: LocalTime) -> String {
        PickerClock.date(time).formatted(Date.FormatStyle(date: .omitted, time: .shortened, timeZone: PickerClock.timeZone))
    }

    /// "Every day · 07:00" or "Mon, Wed, Fri · 23:00 – 07:00".
    static func schedule(_ habit: Habit) -> String {
        let days =
            habit.frequency == .daily
            ? String(localized: "habits.schedule.daily", bundle: .module)
            : habit.weekdays.map { Calendar.current.shortStandaloneWeekdaySymbols[$0 % 7] }.formatted(.list(type: .and, width: .narrow))
        guard let start = habit.startTime else { return days }
        let clock = habit.endTime.map { "\(time(start)) – \(time($0))" } ?? time(start)
        return "\(days) · \(clock)"
    }

    static func line(_ line: HabitLine) -> String {
        switch line.kind {
        case .allDone: return String(localized: "habits.line.allDone", bundle: .module)
        case .nothingToday: return String(localized: "habits.line.nothing", bundle: .module)
        case .next(let habit):
            let next = habit.currentStreak + 1
            let streak: String =
                switch (habit.currentStreak > 0, HabitLine.record(habit)) {
                case (false, _): String(localized: "habits.line.start", bundle: .module)
                case (true, .best): String(localized: "habits.line.best \(next)", bundle: .module)
                case (true, .matchesBest): String(localized: "habits.line.matches \(next)", bundle: .module)
                case (true, .none): String(localized: "habits.line.streak \(next)", bundle: .module)
                }
            guard habit.eligibleDays > 0 else { return streak }
            return String(
                localized: "habits.line.history \(habit.title) \(habit.completedDays) \(habit.eligibleDays) \(streak)", bundle: .module)
        }
    }

    static func rollback(_ error: AppError) -> String {
        let fallback = String(localized: "habits.rollback", bundle: .module)
        switch error {
        case .forbidden(let server), .notFound(let server), .conflict(let server), .validation(let server, _):
            return server.text.map { "\(fallback) \($0)" } ?? fallback
        default:
            return fallback
        }
    }

    static func loadMessage(_ error: AppError) -> String {
        switch error {
        case .offline: String(localized: "habits.error.offline", bundle: .module)
        case .timeout: String(localized: "habits.error.timeout", bundle: .module)
        case .forbidden(let server), .notFound(let server), .conflict(let server), .server(let server), .validation(let server, _),
            .unauthorized(let server), .rateLimited(let server, _):
            server.text ?? String(localized: "habits.error.generic", bundle: .module)
        case .decoding: String(localized: "habits.error.generic", bundle: .module)
        }
    }
}
