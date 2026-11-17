/// What the server said about a failure. `text` is a user-facing sentence written by the web team and may be
/// shown as is; `code`, when present, is what decides behaviour. Never branch on `text`.
public struct ServerMessage: Equatable, Sendable {
    public let text: String?
    public let code: String?

    public init(text: String? = nil, code: String? = nil) {
        self.text = text
        self.code = code
    }
}

/// Every failure a repository can report. Cancellation is not one of them: a cancelled request
/// throws `CancellationError` and shows nothing.
public enum AppError: Error, Equatable, Sendable {
    case offline
    case timeout
    case unauthorized(ServerMessage)
    case forbidden(ServerMessage)
    case notFound(ServerMessage)
    case conflict(ServerMessage)
    case validation(ServerMessage, fields: [String: [String]])
    case rateLimited(ServerMessage, retryAfter: Duration?)
    case server(ServerMessage)
    /// The body did not match the model. Always a bug.
    case decoding
}
