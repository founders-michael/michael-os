import Foundation
import Models
import Observation
import Repositories

/// The create and edit sheet. It says saved only once the server has returned the task.
@MainActor
@Observable
final class TaskEditorModel {
    enum Status: Equatable {
        case editing
        case saving
        case saved(Task)
    }

    var form: TaskForm
    private(set) var status = Status.editing
    /// The server's reasons, by field, from a refused save.
    private(set) var serverErrors: [TaskForm.Field: String] = [:]
    /// A refusal that names no field, or a connection problem.
    private(set) var failure: AppError?
    /// Set once Save has been tried, so the form does not shout before the user is done.
    private(set) var showsProblems = false

    let task: Task?
    let timeZone: String
    let today: LocalDate?
    private let original: TaskForm
    private let tasks: any TaskRepository

    init(task: Task?, timeZone: String, today: LocalDate?, tasks: any TaskRepository) {
        self.task = task
        self.timeZone = timeZone
        self.today = today
        self.tasks = tasks
        let form = task.map { TaskForm($0, timeZone: TaskFormat.zone(timeZone)) } ?? TaskForm()
        self.form = form
        original = form
    }

    var isNew: Bool { task == nil }

    /// Closing would lose what the user typed.
    var hasChanges: Bool { form != original }

    var canSave: Bool { status == .editing }

    /// What the field shows under it: the server's reason first, then the form's own once Save was tried.
    func message(for field: TaskForm.Field) -> String? {
        if let server = serverErrors[field] { return server }
        guard showsProblems, let problem = form.problems[field] else { return nil }
        return Self.text(problem)
    }

    func edit(_ change: (inout TaskForm) -> Void) {
        let before = form
        change(&form)
        form.title = String(form.title.prefix(TaskForm.titleLimit))
        form.notes = String(form.notes.prefix(TaskForm.notesLimit))
        form.estimate = Self.digits(form.estimate)
        form.remaining = Self.digits(form.remaining)
        for field in TaskForm.Field.allCases where Self.value(of: field, in: before) != Self.value(of: field, in: form) {
            serverErrors[field] = nil
        }
        failure = nil
    }

    func save() async {
        guard canSave else { return }
        showsProblems = true
        guard let body = form.save(comparedWith: task == nil ? nil : original) else { return }
        status = .saving
        failure = nil
        serverErrors = [:]
        do {
            let saved = try await tasks.save(body, to: task?.id)
            status = .saved(saved)
        } catch is CancellationError {
            status = .editing
        } catch {
            status = .editing
            let failure = AppError(error)
            if case .validation(_, let fields) = failure, !fields.isEmpty {
                for (name, reasons) in fields {
                    let field = TaskForm.Field(rawValue: name) ?? .title
                    serverErrors[field] = reasons.first
                }
            }
            if serverErrors.isEmpty { self.failure = failure }
        }
    }

    static func text(_ problem: TaskForm.Problem) -> String {
        switch problem {
        case .titleMissing: String(localized: "tasks.editor.problem.title", bundle: .module)
        case .minutesOutOfRange: String(localized: "tasks.editor.problem.minutes", bundle: .module)
        case .repeatNeedsDueDate: String(localized: "tasks.editor.problem.repeatDueDate", bundle: .module)
        case .repeatNeedsWeekday: String(localized: "tasks.editor.problem.repeatWeekday", bundle: .module)
        case .endsBeforeDueDate: String(localized: "tasks.editor.problem.repeatEnds", bundle: .module)
        case .reminderHalfSet: String(localized: "tasks.editor.problem.reminder", bundle: .module)
        }
    }

    private static func digits(_ text: String) -> String {
        String(text.filter(\.isASCIIDigit).prefix(4))
    }

    private static func value(of field: TaskForm.Field, in form: TaskForm) -> String {
        switch field {
        case .title: form.title
        case .description: form.notes
        case .estimatedDurationMinutes: form.estimate
        case .remainingDurationMinutes: form.remaining
        case .dueDate: form.dueDate?.description ?? ""
        case .recurrence: "\(form.repeatRule)"
        case .reminder: "\(String(describing: form.reminderDate)) \(String(describing: form.reminderTime))"
        }
    }
}

extension Character {
    fileprivate var isASCIIDigit: Bool { ("0"..."9").contains(self) }
}
