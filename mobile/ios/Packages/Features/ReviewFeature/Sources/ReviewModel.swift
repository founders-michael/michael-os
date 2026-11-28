import Foundation
import Models
import Observation
import Repositories

/// One date's review, the reflection being written, and the missed tasks moved from here.
@MainActor
@Observable
final class ReviewModel {
    enum State: Equatable {
        case loading
        case content(DailyReview)
        case failed(AppError)
    }

    static let autosaveDelay = Duration.milliseconds(750)

    private(set) var state = State.loading
    /// The server's today, from the first read (which sends no date).
    private(set) var today: LocalDate?
    private(set) var draft = ReflectionDraft()
    private(set) var saveState = SaveState.saved
    private(set) var moved: [String: Moved] = [:]
    private(set) var busyTask: String?
    private(set) var moveProblems: [String: AppError] = [:]

    private let reviews: any ReviewRepository
    private var saved = ReflectionDraft()
    private var isSaving = false
    private var pendingSave: _Concurrency.Task<Void, Never>?

    init(reviews: any ReviewRepository) {
        self.reviews = reviews
    }

    var review: DailyReview? {
        if case .content(let review) = state { return review }
        return nil
    }

    func load(_ date: LocalDate? = nil) async {
        if review == nil { state = .loading }
        do {
            let loaded = try await reviews.review(date ?? review?.date)
            if today == nil { today = loaded.date }
            let isNewDate = loaded.date != review?.date
            state = .content(loaded)
            moved = [:]
            moveProblems = [:]
            if isNewDate || saveState == .saved {
                draft = ReflectionDraft(loaded.reflection)
                saved = draft
                saveState = .saved
            }
        } catch is CancellationError {
        } catch {
            if review == nil { state = .failed(AppError(error)) }
        }
    }

    /// Sends what is pending first, so changing the date never drops text.
    func show(days offset: Int) async {
        guard let date = review?.date else { return }
        await flush()
        await load(date.adding(days: offset))
    }

    func edit(_ field: ReflectionDraft.Field, _ text: String) {
        draft[field] = text
        scheduleSave()
    }

    func toggleSkipped(_ task: String) {
        draft.toggleSkipped(task)
        scheduleSave()
    }

    /// Saves now whatever has not been saved: leaving the screen or changing the date.
    func flush() async {
        pendingSave?.cancel()
        await saveNow()
    }

    func carryForward(_ task: String, _ form: CarryForwardForm) async {
        guard let review, let today, form.problem(review: review.date, today: today) == nil else { return }
        await move(task, .move(task, from: review.date, to: form.date, start: form.startTime, end: form.endTime))
    }

    func unschedule(_ task: String) async {
        guard let review else { return }
        await move(task, .unschedule(task, from: review.date))
    }

    private func move(_ task: String, _ request: CarryForward) async {
        guard busyTask == nil else { return }
        busyTask = task
        moveProblems[task] = nil
        defer { busyTask = nil }
        do {
            moved[task] = try await reviews.carryForward(request).map(Moved.date) ?? .unscheduled
        } catch is CancellationError {
        } catch {
            moveProblems[task] = AppError(error)
        }
    }

    private func scheduleSave() {
        pendingSave?.cancel()
        guard draft != saved else {
            if !isSaving { saveState = .saved }
            return
        }
        saveState = .unsaved
        pendingSave = _Concurrency.Task { [weak self] in
            try? await _Concurrency.Task.sleep(for: Self.autosaveDelay)
            guard !_Concurrency.Task.isCancelled else { return }
            await self?.saveNow()
        }
    }

    private func saveNow() async {
        guard !isSaving, let date = review?.date, draft != saved else { return }
        isSaving = true
        saveState = .saving
        let snapshot = draft
        var failure: AppError?
        do {
            try await reviews.save(snapshot.save(for: date))
        } catch {
            failure = AppError(error)
        }
        isSaving = false
        // The user moved to another date meanwhile; that date's draft and saved copy are its own.
        guard review?.date == date else { return }
        if let failure {
            saveState = .failed(failure)
        } else {
            saved = snapshot
            saveState = draft == snapshot ? .saved : .unsaved
        }
        // An edit made while this save was in flight.
        if saveState == .unsaved { scheduleSave() }
    }
}

extension AppError {
    init(_ error: any Error) {
        self = error as? AppError ?? .server(ServerMessage())
    }
}
