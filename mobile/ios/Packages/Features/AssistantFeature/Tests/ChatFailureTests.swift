import Foundation
import Models
import Testing

@testable import AssistantFeature

/// Every refusal the chat route sends before the stream opens, and every stream error, has its own action.
struct ChatFailureTests {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func refused(_ error: AppError) -> ChatFailure {
        ChatFailure.refused(error, message: "Hi", now: now)
    }

    private func server(_ code: String, _ text: String? = "Server text.") -> ServerMessage {
        ServerMessage(text: text, code: code)
    }

    @Test func signedOutAndNoAccessOfferNothingToRetry() {
        #expect(refused(.unauthorized(server("UNAUTHENTICATED"))).action == .none)
        let noAccess = refused(.forbidden(server("PRODUCT_ACCESS_REQUIRED", "You do not have access to this product.")))
        #expect(noAccess.action == .none)
        #expect(noAccess.reason == "You do not have access to this product.")
    }

    @Test func setupRequiredSendsTheUserToFinishOnboarding() {
        #expect(refused(.forbidden(server("LIFESTYLE_SETUP_REQUIRED"))).action == .finishSetup)
    }

    @Test(arguments: [
        "AI_DISABLED", "AI_NOT_CONFIGURED", "AI_PAID_TIER_REQUIRED", "AI_CONFIGURATION_ERROR",
        "AI_LOCAL_PROVIDER_NOT_FOR_PRODUCTION", "AI_CONTEXT_UNAVAILABLE",
    ])
    func anUnavailableAssistantSaysSoInItsOwnWordsAndOffersARetry(code: String) {
        let failure = refused(.server(server(code, "AI is disabled in production unless the Gemini project is configured.")))
        #expect(failure.action == .retry)
        #expect(failure.reason == "Michael isn't available right now. Try again in a little while.")
    }

    @Test(arguments: ["MESSAGE_TOO_LARGE", "REQUEST_TOO_LARGE", "INVALID_REQUEST"])
    func aRefusedMessageGoesBackToBeEdited(code: String) {
        let failure = refused(.validation(server(code, "Shorten your message and try again."), fields: [:]))
        #expect(failure.action == .edit)
        #expect(failure.reason == "Shorten your message and try again.")
    }

    @Test func aConversationTooLongOrDeletedStartsANewChat() {
        #expect(refused(.validation(server("CONVERSATION_TOO_LARGE"), fields: [:])).action == .newChat)
        #expect(refused(.notFound(server("CONVERSATION_NOT_FOUND"))).action == .newChat)
    }

    @Test func theConversationLimitOpensHistory() {
        let failure = refused(.conflict(server("CONVERSATION_LIMIT_REACHED", "Archive an older conversation first; the limit is 200.")))
        #expect(failure.action == .openHistory)
        #expect(failure.reason == "Archive an older conversation first; the limit is 200.")
    }

    @Test func rateLimitedWaitsForRetryAfterOrThirtySeconds() {
        #expect(refused(.rateLimited(server("RATE_LIMITED"), retryAfter: .seconds(12))).action == .retryAfter(now.addingTimeInterval(12)))
        #expect(refused(.rateLimited(server("RATE_LIMITED"), retryAfter: nil)).action == .retryAfter(now.addingTimeInterval(30)))
    }

    @Test func connectionProblemsRetry() {
        #expect(refused(.offline).action == .retry)
        #expect(refused(.timeout).action == .retry)
        #expect(refused(.server(server("AI_REQUEST_FAILED"))).action == .retry)
        #expect(refused(.decoding).action == .retry)
    }

    @Test func aStreamErrorShowsTheServersSentenceAndTheProviderLimitWaits() {
        let busy = ChatFailure.streamFailed(
            ChatStreamError(
                code: "PROVIDER_RATE_LIMITED", message: "The AI provider is busy. Please wait and retry.", retryAfterSeconds: 30),
            message: "Hi",
            now: now
        )
        #expect(busy.action == .retryAfter(now.addingTimeInterval(30)))
        #expect(busy.reason == "The AI provider is busy. Please wait and retry.")
        for code in [
            "AI_TIMEOUT", "AI_UNAVAILABLE", "AI_MODEL_NOT_FOUND", "AI_PROJECT_ACCESS_DENIED", "AI_INVALID_RESPONSE", "AI_REQUEST_FAILED",
        ] {
            let failure = ChatFailure.streamFailed(ChatStreamError(code: code, message: "Words."), message: "Hi", now: now)
            #expect(failure.action == .retry && failure.reason == "Words.", "\(code)")
        }
    }
}
