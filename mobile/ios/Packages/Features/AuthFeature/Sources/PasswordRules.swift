/// The server's password rule, shown while typing so the user is never refused for something they could see.
/// Mirrors `meetsPasswordPolicy` in the web app exactly: 12 to 128 UTF-16 code units (JavaScript's
/// `length`), an ASCII upper-case letter and an ASCII lower-case letter.
struct PasswordRules: Equatable {
    static let minimumLength = 12
    static let maximumLength = 128

    let length: Int
    let hasUppercase: Bool
    let hasLowercase: Bool

    init(_ password: String) {
        length = password.utf16.count
        hasUppercase = password.unicodeScalars.contains { ("A"..."Z").contains($0) }
        hasLowercase = password.unicodeScalars.contains { ("a"..."z").contains($0) }
    }

    var hasLength: Bool { (Self.minimumLength...Self.maximumLength).contains(length) }

    var isMet: Bool { hasLength && hasUppercase && hasLowercase }
}
