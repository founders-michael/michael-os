import Foundation
import Models

extension AppError {
    /// The sentence the auth screens show. A wrong password and an unknown email get the same words, so the
    /// screen never says which one was wrong.
    var authMessage: String {
        switch self {
        case .offline: String(localized: "auth.error.offline", bundle: .module)
        case .timeout: String(localized: "auth.error.timeout", bundle: .module)
        case .unauthorized: String(localized: "auth.error.credentials", bundle: .module)
        case .rateLimited: String(localized: "auth.error.rateLimited", bundle: .module)
        case .decoding: String(localized: "auth.error.generic", bundle: .module)
        case .forbidden(let server), .notFound(let server), .conflict(let server), .server(let server),
            .validation(let server, _):
            server.text ?? String(localized: "auth.error.generic", bundle: .module)
        }
    }
}
