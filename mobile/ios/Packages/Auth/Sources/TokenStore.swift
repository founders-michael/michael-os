import Foundation
import Security

public protocol TokenStore: Sendable {
    func read() throws -> String?
    func save(_ token: String) throws
    func delete() throws
}

/// The session token in the Keychain, readable after first unlock, never synced and never in a backup.
public struct KeychainTokenStore: TokenStore {
    public struct Failure: Error, Equatable {
        public let status: OSStatus
    }

    private let service: String

    public init(service: String = "com.michaelos.app.session") {
        self.service = service
    }

    public func read() throws -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data, let token = String(bytes: data, encoding: .utf8) else {
            throw Failure(status: status)
        }
        return token
    }

    public func save(_ token: String) throws {
        try delete()
        var item = baseQuery
        item[kSecValueData as String] = Data(token.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(item as CFDictionary, nil)
        guard status == errSecSuccess else { throw Failure(status: status) }
    }

    public func delete() throws {
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw Failure(status: status) }
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "session-token",
        ]
    }
}
