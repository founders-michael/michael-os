import Foundation
import Models
import Observation
import Repositories

/// The account the Settings screens show.
@MainActor
@Observable
final class SettingsModel {
    enum State: Equatable {
        case loading
        case content(Account)
        case failed(AppError)
    }

    private(set) var state = State.loading
    private let accounts: any AccountRepository

    init(accounts: any AccountRepository) {
        self.accounts = accounts
    }

    var account: Account? {
        if case .content(let account) = state { return account }
        return nil
    }

    func load() async {
        if account == nil { state = .loading }
        do {
            state = .content(try await accounts.account())
        } catch is CancellationError {
        } catch {
            if account == nil { state = .failed(AppError(error)) }
        }
    }

    func replace(_ account: Account) {
        state = .content(account)
    }
}

/// Names and picture. It says saved only once the server has the account.
@MainActor
@Observable
final class AccountEditorModel {
    var form: AccountForm
    private(set) var saving = false
    private(set) var saved: Account?
    private(set) var failure: AppError?
    private(set) var serverErrors: [String: String] = [:]
    private(set) var showsProblems = false
    /// The chosen photo could not be made into a picture the server accepts.
    private(set) var pictureRefused = false
    let account: Account
    let accounts: any AccountRepository
    /// Settings' summary card follows the picture without leaving the screen.
    var pictureChanged: ((Account) -> Void)?

    init(account: Account, accounts: any AccountRepository) {
        self.account = account
        self.accounts = accounts
        shown = account
        form = AccountForm(account)
    }

    var hasChanges: Bool { form != AccountForm(account) }

    /// The account with the latest picture change, which applies at once without the names' Save.
    private(set) var shown: Account

    func refusePicture() {
        pictureRefused = true
    }

    func edit(_ change: (inout AccountForm) -> Void) {
        change(&form)
        serverErrors = [:]
        failure = nil
    }

    func save() async {
        showsProblems = true
        guard !saving, let body = form.save else { return }
        await perform { try await self.accounts.save(body) }
    }

    func removePicture() async {
        await changePicture { try await self.accounts.removePicture() }
    }

    /// `image` is already re-encoded; a picture the server would refuse is not sent.
    func upload(_ image: Data) async {
        guard PictureRules.isAccepted(image), let type = PictureRules.contentType(of: image) else {
            pictureRefused = true
            return
        }
        pictureRefused = false
        await changePicture { try await self.accounts.uploadPicture(image, contentType: type) }
    }

    private func changePicture(_ work: () async throws -> Account) async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        do {
            shown = try await work()
            pictureChanged?(shown)
        } catch is CancellationError {
        } catch {
            failure = AppError(error)
        }
    }

    private func perform(_ work: () async throws -> Account) async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        do {
            saved = try await work()
        } catch is CancellationError {
        } catch {
            let failure = AppError(error)
            if case .validation(_, let fields) = failure, !fields.isEmpty {
                serverErrors = fields.compactMapValues(\.first)
            } else {
                self.failure = failure
            }
        }
    }
}

/// My Context. A save names the version it edited; when the server has a newer one, both are shown.
@MainActor
@Observable
final class ContextEditorModel {
    enum State: Equatable {
        case loading
        case editing
        case failed(AppError)
    }

    private(set) var state = State.loading
    private(set) var draft = ContextDraft(PersonalContext(summary: "", updatedAt: nil))
    private(set) var saved = ""
    private(set) var saving = false
    private(set) var failure: AppError?
    /// The copy saved elsewhere, while the user chooses between it and theirs.
    private(set) var conflict: PersonalContext?
    private let accounts: any AccountRepository

    init(accounts: any AccountRepository) {
        self.accounts = accounts
    }

    var hasChanges: Bool { ContextDraft.normalized(draft.text) != saved }

    func load() async {
        do {
            show(try await accounts.context())
        } catch is CancellationError {
        } catch {
            if state == .loading { state = .failed(AppError(error)) }
        }
    }

    func edit(_ text: String) {
        draft.text = text
        failure = nil
    }

    func save() async {
        guard !saving, !draft.isTooLong else { return }
        await write(over: draft.version)
    }

    /// Saves this device's text over the copy saved elsewhere.
    func keepMine() async {
        guard let conflict else { return }
        await write(over: conflict.version)
    }

    func useSaved() {
        guard let conflict else { return }
        show(conflict)
    }

    private func write(over version: String?) async {
        saving = true
        defer { saving = false }
        do {
            let result = try await accounts.save(draft.save(over: version))
            show(result)
        } catch AppError.conflict {
            conflict = try? await accounts.context()
            if conflict == nil { failure = .server(ServerMessage()) }
        } catch is CancellationError {
        } catch {
            failure = AppError(error)
        }
    }

    private func show(_ context: PersonalContext) {
        draft = ContextDraft(context)
        saved = context.summary
        conflict = nil
        state = .editing
    }
}

/// The routine fields from onboarding, saved to the profile without the preferred name.
@MainActor
@Observable
final class RoutineEditorModel {
    enum State: Equatable {
        case loading
        case editing(saved: RoutineForm)
        case failed(AppError)
    }

    private(set) var state = State.loading
    var form: RoutineForm?
    private(set) var saving = false
    private(set) var failure: AppError?
    private(set) var serverErrors: [String: String] = [:]
    private(set) var saved = false
    private let profiles: any ProfileRepository

    init(profiles: any ProfileRepository) {
        self.profiles = profiles
    }

    var hasChanges: Bool {
        guard case .editing(let saved) = state else { return false }
        return form != saved
    }

    func load() async {
        do {
            guard let profile = try await profiles.profile() else {
                state = .failed(.conflict(ServerMessage()))
                return
            }
            show(profile)
        } catch is CancellationError {
        } catch {
            if state == .loading { state = .failed(AppError(error)) }
        }
    }

    func edit(_ change: (inout RoutineForm) -> Void) {
        guard var form else { return }
        change(&form)
        self.form = form
        serverErrors = [:]
        failure = nil
    }

    func save() async {
        guard !saving, let body = form?.save else { return }
        saving = true
        defer { saving = false }
        do {
            show(try await profiles.saveRoutine(body))
            saved = true
        } catch is CancellationError {
        } catch {
            let failure = AppError(error)
            if case .validation(_, let fields) = failure, !fields.isEmpty {
                serverErrors = fields.compactMapValues(\.first)
            } else {
                self.failure = failure
            }
        }
    }

    private func show(_ profile: Profile) {
        let form = RoutineForm(profile)
        self.form = form
        state = .editing(saved: form)
    }
}

/// Weekly availability, saved as a whole set once every window passes the server's rules.
@MainActor
@Observable
final class AvailabilityEditorModel {
    enum State: Equatable {
        case loading
        case editing
        case failed(AppError)
    }

    private(set) var state = State.loading
    private(set) var plan = AvailabilityPlan(Availability(timeZone: "", configured: false, windows: []))
    private var savedWindows: [AvailabilityWindow] = []
    private(set) var saving = false
    private(set) var saved = false
    private(set) var failure: AppError?
    private let calendar: any CalendarRepository

    init(calendar: any CalendarRepository) {
        self.calendar = calendar
    }

    var hasChanges: Bool { plan.windows != savedWindows }
    var canSave: Bool { hasChanges && plan.save != nil && !saving }

    func load() async {
        do {
            show(try await calendar.availability())
        } catch is CancellationError {
        } catch {
            if state == .loading { state = .failed(AppError(error)) }
        }
    }

    func edit(_ change: (inout AvailabilityPlan) -> Void) {
        change(&plan)
        failure = nil
        saved = false
    }

    func save() async {
        guard canSave, let body = plan.save else { return }
        saving = true
        defer { saving = false }
        do {
            show(try await calendar.saveAvailability(body))
            saved = true
        } catch is CancellationError {
        } catch {
            failure = AppError(error)
        }
    }

    private func show(_ availability: Availability) {
        plan = AvailabilityPlan(availability)
        savedWindows = plan.windows
        state = .editing
    }
}

/// Deleting the account: password and the typed word, then sign out on this device.
@MainActor
@Observable
final class DeleteAccountModel {
    var password = ""
    var typed = ""
    private(set) var deleting = false
    private(set) var failure: AppError?
    private(set) var deleted = false
    private let accounts: any AccountRepository

    init(accounts: any AccountRepository) {
        self.accounts = accounts
    }

    var isReady: Bool { DeleteConfirmation.isReady(password: password, typed: typed) && !deleting }

    func delete() async {
        guard isReady else { return }
        deleting = true
        failure = nil
        defer { deleting = false }
        do {
            try await accounts.deleteAccount(password: password)
            deleted = true
        } catch is CancellationError {
        } catch {
            failure = AppError(error)
            password = ""
        }
    }
}

extension AppError {
    init(_ error: any Error) {
        self = error as? AppError ?? .server(ServerMessage())
    }
}
