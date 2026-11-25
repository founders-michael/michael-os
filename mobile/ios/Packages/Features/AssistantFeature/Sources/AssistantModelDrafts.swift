import Foundation
import Models
import Repositories

extension AssistantModel {
    public enum Destination: Equatable, Sendable {
        case tasks, goals, habits, calendar, settings
    }

    func draft(_ id: DraftCard.ID) -> DraftCard? {
        content?.entries.lazy.compactMap { entry -> DraftCard? in
            guard case .michael(let reply) = entry.body else { return nil }
            return reply.drafts.first { $0.id == id }
        }
        .first
    }

    func updateDraft(_ id: DraftCard.ID, _ change: (inout DraftCard) -> Void) {
        update { content in
            for entryIndex in content.entries.indices {
                guard case .michael(var reply) = content.entries[entryIndex].body,
                    let draftIndex = reply.drafts.firstIndex(where: { $0.id == id })
                else { continue }
                change(&reply.drafts[draftIndex])
                content.entries[entryIndex].body = .michael(reply)
                return
            }
        }
    }

    func edit(_ id: DraftCard.ID, field: String, to value: DraftValue?) {
        updateDraft(id) { card in
            guard card.status == .editing else { return }
            card.form.set(field, to: value)
            card.fieldErrors[field] = nil
            card.error = nil
        }
    }

    /// Posts the edited values to the kind's own endpoint as the user. The card says saved only once the create
    /// call has returned; Michael cannot save anything himself.
    func save(_ id: DraftCard.ID) {
        guard let card = draft(id), card.status == .editing else { return }
        guard let submission = card.form.submission else {
            updateDraft(id) { $0.error = String(localized: "draft.error.incomplete", bundle: .module) }
            return
        }
        updateDraft(id) {
            $0.status = .saving
            $0.error = nil
            $0.fieldErrors = [:]
        }
        // Held by the model, so leaving the screen does not cancel a save the user started.
        _Concurrency.Task {
            do {
                try await post(submission)
                updateDraft(id) { $0.status = .saved }
                report(.saved, card.form.kind)
            } catch {
                let appError = error as? AppError ?? .server(ServerMessage())
                updateDraft(id) { card in
                    card.status = .editing
                    card.error = Self.saveRefusal(appError)
                    if case .validation(_, let fields) = appError {
                        for (name, reasons) in fields {
                            if let reason = reasons.first { card.fieldErrors[DraftForm.field(forServerField: name)] = reason }
                        }
                    }
                }
            }
        }
    }

    func discard(_ id: DraftCard.ID) {
        guard let card = draft(id), card.status == .editing else { return }
        updateDraft(id) { $0.status = .discarded }
        report(.discarded, card.form.kind)
    }

    static func destination(of kind: DraftKind) -> Destination? {
        switch kind {
        case .task: .tasks
        case .goal: .goals
        case .habit: .habits
        case .calendarEvent: .calendar
        case .memory: .settings
        case .unknown: nil
        }
    }

    private func post(_ submission: DraftSubmission) async throws {
        switch submission {
        case .task(let task): _ = try await repositories.tasks.create(task)
        case .goal(let goal): _ = try await repositories.goals.create(goal)
        case .habit(let habit): _ = try await repositories.habits.create(habit)
        case .calendarEvent(let event): _ = try await repositories.calendar.create(event)
        case .memory(let memory): _ = try await repositories.memories.create(memory)
        }
    }

    /// What the user did with a draft feeds Michael's learning. A lost report never touches the draft, so a
    /// failure here is dropped on purpose, as the web chat does.
    private func report(_ kind: DraftOutcome.Kind, _ subject: DraftKind) {
        guard subject != .unknown else { return }
        let assistant = repositories.assistant
        _Concurrency.Task { try? await assistant.record(DraftOutcome(kind: kind, subject: subject)) }
    }

    private static func saveRefusal(_ error: AppError) -> String {
        switch error {
        case .offline: String(localized: "draft.error.offline", bundle: .module)
        case .timeout: String(localized: "draft.error.timeout", bundle: .module)
        case .conflict(let server), .validation(let server, _), .forbidden(let server), .notFound(let server),
            .rateLimited(let server, _):
            server.text ?? String(localized: "draft.error.generic", bundle: .module)
        case .unauthorized, .server, .decoding: String(localized: "draft.error.generic", bundle: .module)
        }
    }
}
