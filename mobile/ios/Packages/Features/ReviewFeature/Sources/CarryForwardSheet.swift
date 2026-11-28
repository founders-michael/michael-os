import DesignSystem
import Models
import SwiftUI

/// Pick a day, and optionally a time, for a missed task. The sheet closes on Move; the row says how it went.
struct CarryForwardSheet: View {
    let task: Task
    let review: LocalDate
    let today: LocalDate
    let onMove: (CarryForwardForm) -> Void
    @State private var form: CarryForwardForm
    @State private var showsProblem = false
    @Environment(\.dismiss) private var dismiss

    init(task: Task, review: LocalDate, today: LocalDate, onMove: @escaping (CarryForwardForm) -> Void) {
        self.task = task
        self.review = review
        self.today = today
        self.onMove = onMove
        _form = State(initialValue: CarryForwardForm(date: CarryForwardForm.earliest(review: review, today: today)))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: MichaelSpace.lg) {
                    Text(task.title).michaelText(.heading).foregroundStyle(Color.michael.text)
                    DatePicker(
                        String(localized: "review.move.date", bundle: .module),
                        selection: Binding(get: { PickerClock.date(form.date) }, set: { form.date = PickerClock.localDate($0) }),
                        in: PickerClock.date(CarryForwardForm.earliest(review: review, today: today))...,
                        displayedComponents: .date
                    )
                    .environment(\.timeZone, PickerClock.timeZone)
                    .michaelFieldFrame()
                    time(String(localized: "review.move.start", bundle: .module), form.startTime) { form.startTime = $0 }
                    time(String(localized: "review.move.end", bundle: .module), form.endTime) { form.endTime = $0 }
                    if showsProblem, let problem = form.problem(review: review, today: today) {
                        Text(ReviewFormat.problem(problem)).michaelText(.caption).foregroundStyle(Color.michael.danger)
                    } else {
                        Text(String(localized: "review.move.hint", bundle: .module)).michaelText(.caption).foregroundStyle(
                            Color.michael.faint)
                    }
                }
                .padding(MichaelSpace.screenGutter)
            }
            .background(MichaelBackground())
            .navigationTitle(String(localized: "review.move.title", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "review.move.cancel", bundle: .module)) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "review.move.confirm", bundle: .module)) {
                        showsProblem = true
                        guard form.problem(review: review, today: today) == nil else { return }
                        onMove(form)
                        dismiss()
                    }
                }
            }
        }
    }

    private func time(_ label: String, _ value: LocalTime?, set: @escaping (LocalTime?) -> Void) -> some View {
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
                .accessibilityLabel(String(localized: "review.move.clear \(label)", bundle: .module))
            } else {
                Button(String(localized: "review.move.add", bundle: .module)) { set(LocalTime(hour: 9, minute: 0)) }
                    .accessibilityLabel(String(localized: "review.move.addLabel \(label)", bundle: .module))
            }
        }
        .michaelFieldFrame()
    }
}

/// Server dates are calendar dates in the profile's zone, shown on a UTC clock so no zone shifts them.
enum ReviewFormat {
    static func day(_ date: LocalDate) -> String {
        PickerClock.date(date).formatted(Date.FormatStyle(timeZone: PickerClock.timeZone).weekday(.abbreviated).day().month(.abbreviated))
    }

    static func longDay(_ date: LocalDate) -> String {
        PickerClock.date(date).formatted(Date.FormatStyle(timeZone: PickerClock.timeZone).weekday(.wide).day().month(.wide))
    }

    static func weekday(_ date: LocalDate) -> String {
        PickerClock.date(date).formatted(Date.FormatStyle(timeZone: PickerClock.timeZone).weekday(.narrow))
    }

    static func clock(_ instant: Date, zone: String) -> String {
        instant.formatted(Date.FormatStyle(date: .omitted, time: .shortened, timeZone: TimeZone(identifier: zone) ?? .current))
    }

    static func duration(_ minutes: Int) -> String {
        Duration.seconds(minutes * 60).formatted(.units(allowed: [.hours, .minutes], width: .abbreviated))
    }

    static func status(_ status: TaskStatus?) -> String {
        switch status {
        case .todo: String(localized: "review.status.todo", bundle: .module)
        case .inProgress: String(localized: "review.status.inProgress", bundle: .module)
        case .completed: String(localized: "review.status.completed", bundle: .module)
        case .unknown, nil: String(localized: "review.status.unknown", bundle: .module)
        }
    }

    static func moved(_ moved: Moved) -> String {
        switch moved {
        case .date(let date): String(localized: "review.moved \(day(date))", bundle: .module)
        case .unscheduled: String(localized: "review.moved.unscheduled", bundle: .module)
        }
    }

    static func problem(_ problem: CarryForwardForm.Problem) -> String {
        switch problem {
        case .tooEarly: String(localized: "review.move.problem.date", bundle: .module)
        case .oneTime: String(localized: "review.move.problem.times", bundle: .module)
        case .endNotAfterStart: String(localized: "review.move.problem.order", bundle: .module)
        }
    }

    /// The web's `reviewLine`.
    static func line(_ line: ReviewLine) -> String {
        switch line {
        case .nothingPlanned:
            return String(localized: "review.line.nothing", bundle: .module)
        case .completed(let done, let planned, let percent, let open):
            let first =
                planned == 1
                ? String(localized: "review.line.done.one \(done) \(planned) \(percent)", bundle: .module)
                : String(localized: "review.line.done.other \(done) \(planned) \(percent)", bundle: .module)
            let second =
                switch open {
                case 0: String(localized: "review.line.none", bundle: .module)
                case 1: String(localized: "review.line.open.one", bundle: .module)
                default: String(localized: "review.line.open.other \(open)", bundle: .module)
                }
            return "\(first) \(second)"
        }
    }

    static func prompt(_ field: ReflectionDraft.Field) -> String {
        switch field {
        case .wentWell: String(localized: "review.prompt.wentWell", bundle: .module)
        case .challenges: String(localized: "review.prompt.challenges", bundle: .module)
        case .blockers: String(localized: "review.prompt.blockers", bundle: .module)
        case .lessonsLearned: String(localized: "review.prompt.lessons", bundle: .module)
        case .improvements: String(localized: "review.prompt.improvements", bundle: .module)
        }
    }

    static func placeholder(_ field: ReflectionDraft.Field) -> String {
        switch field {
        case .wentWell: String(localized: "review.placeholder.wentWell", bundle: .module)
        case .challenges: String(localized: "review.placeholder.challenges", bundle: .module)
        case .blockers: String(localized: "review.placeholder.blockers", bundle: .module)
        case .lessonsLearned: String(localized: "review.placeholder.lessons", bundle: .module)
        case .improvements: String(localized: "review.placeholder.improvements", bundle: .module)
        }
    }

    static func saveFailure(_ error: AppError) -> String {
        "\(String(localized: "review.save.failedMessage", bundle: .module)) \(message(error))"
    }

    static func message(_ error: AppError) -> String {
        switch error {
        case .offline: String(localized: "review.error.offline", bundle: .module)
        case .timeout: String(localized: "review.error.timeout", bundle: .module)
        case .forbidden(let server), .notFound(let server), .conflict(let server), .server(let server), .validation(let server, _),
            .unauthorized(let server), .rateLimited(let server, _):
            server.text ?? String(localized: "review.error.generic", bundle: .module)
        case .decoding: String(localized: "review.error.generic", bundle: .module)
        }
    }
}
