import Foundation
import Models

extension ChatFailure {
    static let fallbackWait: TimeInterval = 30

    /// A refusal before the stream opened. `code` decides the action; the server's sentence is shown where it is
    /// written for the user.
    static func refused(_ error: AppError, message: String, now: Date) -> ChatFailure {
        switch error {
        case .offline:
            ChatFailure(message: message, reason: local("chat.failure.offline"), action: .retry)
        case .timeout:
            ChatFailure(message: message, reason: local("chat.failure.timeout"), action: .retry)
        case .unauthorized:
            ChatFailure(message: message, reason: local("chat.failure.signedOut"), action: .none)
        case .rateLimited(let server, let retryAfter):
            ChatFailure(
                message: message,
                reason: server.text ?? local("chat.failure.rateLimited"),
                action: .retryAfter(now.addingTimeInterval(retryAfter.map(seconds) ?? fallbackWait))
            )
        case .forbidden, .notFound, .conflict, .validation, .server, .decoding:
            byCode(error, message: message)
        }
    }

    private static func byCode(_ error: AppError, message: String) -> ChatFailure {
        switch error {
        case .forbidden(let server) where server.code == "LIFESTYLE_SETUP_REQUIRED":
            ChatFailure(message: message, reason: local("chat.failure.setup"), action: .finishSetup)
        case .forbidden(let server):
            ChatFailure(message: message, reason: server.text ?? local("chat.failure.noAccess"), action: .none)
        case .notFound(let server) where server.code == "CONVERSATION_NOT_FOUND":
            ChatFailure(message: message, reason: local("chat.failure.conversationGone"), action: .newChat)
        case .conflict(let server) where server.code == "CONVERSATION_LIMIT_REACHED":
            ChatFailure(message: message, reason: server.text ?? local("chat.failure.generic"), action: .openHistory)
        case .validation(let server, _) where server.code == "CONVERSATION_TOO_LARGE":
            ChatFailure(message: message, reason: local("chat.failure.conversationTooLong"), action: .newChat)
        case .validation(let server, _):
            ChatFailure(message: message, reason: server.text ?? local("chat.failure.edit"), action: .edit)
        case .server(let server) where unavailableCodes.contains(server.code ?? ""):
            // These sentences are written for whoever runs the server, not for the person asking.
            ChatFailure(message: message, reason: local("chat.failure.unavailable"), action: .retry)
        default:
            ChatFailure(message: message, reason: local("chat.failure.generic"), action: .retry)
        }
    }

    /// An `error` event after the stream opened: the server's sentence and code, as the JSON route would send.
    static func streamFailed(_ error: ChatStreamError, message: String, now: Date) -> ChatFailure {
        guard error.code == "PROVIDER_RATE_LIMITED" else {
            return ChatFailure(message: message, reason: error.message, action: .retry)
        }
        let wait = error.retryAfterSeconds.map(TimeInterval.init) ?? fallbackWait
        return ChatFailure(message: message, reason: error.message, action: .retryAfter(now.addingTimeInterval(wait)))
    }

    /// The stream closed with neither a reply nor an error: a dropped connection, never an empty reply.
    static func interrupted(message: String) -> ChatFailure {
        ChatFailure(message: message, reason: local("chat.failure.interrupted"), action: .retry)
    }

    /// The app stayed in the background past the grace period and the stream was closed without a reply.
    static func backgrounded(message: String) -> ChatFailure {
        ChatFailure(message: message, reason: local("chat.failure.backgrounded"), action: .reloadThenRetry)
    }

    private static let unavailableCodes: Set<String> = [
        "AI_DISABLED", "AI_NOT_CONFIGURED", "AI_PAID_TIER_REQUIRED", "AI_CONFIGURATION_ERROR",
        "AI_LOCAL_PROVIDER_NOT_FOR_PRODUCTION", "AI_CONTEXT_UNAVAILABLE", "AI_UNAVAILABLE",
    ]

    private static func local(_ key: String.LocalizationValue) -> String {
        String(localized: key, bundle: .module)
    }

    private static func seconds(_ duration: Duration) -> TimeInterval {
        TimeInterval(duration.components.seconds)
    }
}
