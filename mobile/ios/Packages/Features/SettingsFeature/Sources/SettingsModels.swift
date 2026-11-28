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
    let account: Account
    private let accounts: any AccountRepository

    init(account: Account, accounts: any AccountRepository) {
        self.account = account
        self.accounts = accounts
        form = AccountForm(account)
    }

    var hasChanges: Bool { form != AccountForm(account) }

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
        await perform { try await self.accounts.removePicture() }
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
