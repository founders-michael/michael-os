package com.michaelos.feature.assistant

import com.michaelos.core.model.AppError
import com.michaelos.core.model.ChatStreamError
import com.michaelos.core.model.ServerMessage
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant
import kotlin.time.Duration.Companion.seconds

/** Every refusal the chat route sends before the stream opens, and every stream error, has its own action. */
class ChatFailureTest {
    private val now = Instant.parse("2027-01-15T08:00:00Z")

    private fun refused(error: AppError) = ChatFailure.refused(error, "Hi", now)

    private fun server(
        code: String,
        text: String? = "Server text.",
    ) = ServerMessage(text, code)

    @Test
    fun signedOutAndNoAccessOfferNothingToRetry() {
        assertEquals(ChatFailure.Action.None, refused(AppError.Unauthorized(server("UNAUTHENTICATED"))).action)
        val noAccess = refused(AppError.Forbidden(server("PRODUCT_ACCESS_REQUIRED", "You do not have access to this product.")))
        assertEquals(ChatFailure.Action.None, noAccess.action)
        assertEquals(Reason.Server("You do not have access to this product."), noAccess.reason)
    }

    @Test
    fun setupRequiredSendsTheUserToFinishOnboarding() {
        assertEquals(ChatFailure.Action.FinishSetup, refused(AppError.Forbidden(server("LIFESTYLE_SETUP_REQUIRED"))).action)
    }

    @Test
    fun anUnavailableAssistantSaysSoInItsOwnWordsAndOffersARetry() {
        for (code in listOf(
            "AI_DISABLED",
            "AI_NOT_CONFIGURED",
            "AI_PAID_TIER_REQUIRED",
            "AI_CONFIGURATION_ERROR",
            "AI_LOCAL_PROVIDER_NOT_FOR_PRODUCTION",
            "AI_CONTEXT_UNAVAILABLE",
        )) {
            val failure = refused(AppError.Server(server(code, "AI is disabled in production unless the Gemini project is configured.")))
            assertEquals(code, ChatFailure.Action.Retry, failure.action)
            assertEquals(code, Reason.Local(R.string.chat_failure_unavailable), failure.reason)
        }
    }

    @Test
    fun aRefusedMessageGoesBackToBeEdited() {
        for (code in listOf("MESSAGE_TOO_LARGE", "REQUEST_TOO_LARGE", "INVALID_REQUEST")) {
            val failure = refused(AppError.Validation(server(code, "Shorten your message and try again."), emptyMap()))
            assertEquals(code, ChatFailure.Action.Edit, failure.action)
            assertEquals(Reason.Server("Shorten your message and try again."), failure.reason)
        }
    }

    @Test
    fun aConversationTooLongOrDeletedStartsANewChat() {
        assertEquals(ChatFailure.Action.NewChat, refused(AppError.Validation(server("CONVERSATION_TOO_LARGE"), emptyMap())).action)
        assertEquals(ChatFailure.Action.NewChat, refused(AppError.NotFound(server("CONVERSATION_NOT_FOUND"))).action)
    }

    @Test
    fun theConversationLimitOpensHistory() {
        val failure =
            refused(AppError.Conflict(server("CONVERSATION_LIMIT_REACHED", "Archive an older conversation first; the limit is 200.")))
        assertEquals(ChatFailure.Action.OpenHistory, failure.action)
        assertEquals(Reason.Server("Archive an older conversation first; the limit is 200."), failure.reason)
    }

    @Test
    fun rateLimitedWaitsForRetryAfterOrThirtySeconds() {
        assertEquals(
            ChatFailure.Action.RetryAfter(now.plusSeconds(12)),
            refused(AppError.RateLimited(server("RATE_LIMITED"), 12.seconds)).action,
        )
        assertEquals(ChatFailure.Action.RetryAfter(now.plusSeconds(30)), refused(AppError.RateLimited(server("RATE_LIMITED"), null)).action)
    }

    @Test
    fun connectionProblemsRetry() {
        for (error in listOf(AppError.Offline, AppError.Timeout, AppError.Server(server("AI_REQUEST_FAILED")), AppError.Decoding)) {
            assertEquals("$error", ChatFailure.Action.Retry, refused(error).action)
        }
    }

    @Test
    fun aStreamErrorShowsTheServersSentenceAndTheProviderLimitWaits() {
        val busy =
            ChatFailure.streamFailed(
                ChatStreamError("PROVIDER_RATE_LIMITED", "The AI provider is busy. Please wait and retry.", 30),
                "Hi",
                now,
            )
        assertEquals(ChatFailure.Action.RetryAfter(now.plusSeconds(30)), busy.action)
        assertEquals(Reason.Server("The AI provider is busy. Please wait and retry."), busy.reason)
        for (code in listOf(
            "AI_TIMEOUT",
            "AI_UNAVAILABLE",
            "AI_MODEL_NOT_FOUND",
            "AI_PROJECT_ACCESS_DENIED",
            "AI_INVALID_RESPONSE",
            "AI_REQUEST_FAILED",
        )) {
            val failure = ChatFailure.streamFailed(ChatStreamError(code, "Words."), "Hi", now)
            assertEquals(code, ChatFailure("Hi", Reason.Server("Words."), ChatFailure.Action.Retry), failure)
        }
    }
}
