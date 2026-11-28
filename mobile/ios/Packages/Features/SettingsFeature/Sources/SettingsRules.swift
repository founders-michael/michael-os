import Foundation
import Models

/// The two names the user may change. Rules mirror `account-validation.ts`; the server checks them again.
struct AccountForm: Equatable {
    static let nameLimit = 80

    enum Problem: Equatable {
        case missing, tooLong
    }

    var fullName: String
    var preferredName: String

    init(_ account: Account) {
        fullName = account.fullName
        preferredName = account.preferredName
    }

    /// Runs of spaces become one and the ends are trimmed, as the server stores it.
    static func normalized(_ name: String) -> String {
        name.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    static func problem(_ name: String) -> Problem? {
        let name = normalized(name)
        if name.isEmpty { return .missing }
        return name.count > nameLimit ? .tooLong : nil
    }

    var save: AccountUpdate? {
        guard Self.problem(fullName) == nil, Self.problem(preferredName) == nil else { return nil }
        return AccountUpdate(fullName: Self.normalized(fullName), preferredName: Self.normalized(preferredName))
    }
}

/// My Context as the editor holds it, with the version it was loaded at.
struct ContextDraft: Equatable {
    static let limit = 5000

    var text: String
    let version: String?

    init(_ context: PersonalContext) {
        text = context.summary
        version = context.version
    }

    /// What the server stores and counts: Windows line endings become `\n`, trailing space is dropped.
    static func normalized(_ text: String) -> String {
        let unix = text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        guard let last = unix.lastIndex(where: { !$0.isWhitespace }) else { return "" }
        return String(unix[...last])
    }

    var count: Int { Self.normalized(text).count }
    var isTooLong: Bool { count > Self.limit }

    func save(over version: String?) -> PersonalContextSave {
        PersonalContextSave(summary: Self.normalized(text), expectedUpdatedAt: version)
    }
}

extension PersonalContext {
    var version: String? { updatedAt }
}

/// Deleting the account asks for the password and for this word typed exactly.
enum DeleteConfirmation {
    static let word = "DELETE"

    static func isReady(password: String, typed: String) -> Bool {
        !password.isEmpty && typed == word
    }
}
