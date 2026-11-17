import Foundation
import Models

enum Failure: Sendable {
    case response(status: Int, body: Data, retryAfter: String?)
    case transport(URLError)
}

/// The one place a failed request becomes an `AppError`. The table is in engineering-standards.md section 4.
func appError(for failure: Failure) -> AppError {
    switch failure {
    case .transport(let error):
        return error.code == .timedOut ? .timeout : .offline
    case .response(let status, let body, let retryAfter):
        let parsed = try? JSONDecoder().decode(ErrorBody.self, from: body)
        // Next.js routes send `error`; Better Auth's own routes send `message`.
        let message = ServerMessage(text: parsed?.error ?? parsed?.message, code: parsed?.code)
        switch status {
        case 400, 413, 422: return .validation(message, fields: parsed?.fields ?? [:])
        case 401: return .unauthorized(message)
        case 403: return .forbidden(message)
        case 404: return .notFound(message)
        case 409: return .conflict(message)
        case 429: return .rateLimited(message, retryAfter: retryAfter.flatMap(Int.init).map { .seconds($0) })
        default: return .server(message)
        }
    }
}

private struct ErrorBody: Decodable {
    let error: String?
    let message: String?
    let code: String?
    let fields: [String: [String]]?
}
