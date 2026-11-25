package com.michaelos.core.data

import com.michaelos.core.model.ChatEvent
import com.michaelos.core.model.ChatRequest
import com.michaelos.core.model.Conversation
import com.michaelos.core.model.ConversationCreate
import com.michaelos.core.model.ConversationDeleted
import com.michaelos.core.model.ConversationFilter
import com.michaelos.core.model.ConversationMessages
import com.michaelos.core.model.ConversationPage
import com.michaelos.core.model.ConversationResponse
import com.michaelos.core.model.ConversationUpdate
import com.michaelos.core.model.DraftOutcome
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.OutcomeRecorded
import com.michaelos.core.network.ApiClient
import com.michaelos.core.network.ApiRequest
import javax.inject.Inject

/** The most the server returns in one page of messages. */
const val MESSAGE_PAGE_SIZE = 100

interface AssistantRepository {
    suspend fun conversations(
        filter: ConversationFilter,
        page: Int,
    ): Outcome<ConversationPage>

    suspend fun createConversation(): Outcome<Conversation>

    suspend fun updateConversation(
        id: String,
        change: ConversationUpdate,
    ): Outcome<Conversation>

    suspend fun deleteConversation(id: String): Outcome<Unit>

    /** A page of [MESSAGE_PAGE_SIZE] messages, oldest first. */
    suspend fun messages(
        id: String,
        page: Int,
    ): Outcome<ConversationMessages>

    /**
     * Sends one message and hands each stream event to [onEvent] until the server closes the stream. The server saves
     * the exchange only when the turn completes.
     */
    suspend fun send(
        request: ChatRequest,
        onEvent: (ChatEvent) -> Unit,
    ): Outcome<Unit>

    suspend fun record(outcome: DraftOutcome): Outcome<Unit>
}

class RemoteAssistantRepository
    @Inject
    constructor(
        private val client: ApiClient,
    ) : AssistantRepository {
        override suspend fun conversations(
            filter: ConversationFilter,
            page: Int,
        ): Outcome<ConversationPage> {
            val query =
                listOf("product" to "lifestyle", "include" to filter.wire, "page" to page.toString(), "limit" to LIST_PAGE_SIZE.toString())
            return client.send(ApiRequest.get<ConversationPage>("/api/ai/conversations", query)).value()
        }

        override suspend fun createConversation(): Outcome<Conversation> =
            client
                .send(ApiRequest.post<ConversationResponse, ConversationCreate>("/api/ai/conversations", ConversationCreate()))
                .value()
                .map { it.conversation }

        override suspend fun updateConversation(
            id: String,
            change: ConversationUpdate,
        ): Outcome<Conversation> =
            client
                .send(ApiRequest.patch<ConversationResponse, ConversationUpdate>("/api/ai/conversations/$id", change))
                .value()
                .map { it.conversation }

        override suspend fun deleteConversation(id: String): Outcome<Unit> =
            client.send(ApiRequest.delete<ConversationDeleted>("/api/ai/conversations/$id")).value().map { }

        override suspend fun messages(
            id: String,
            page: Int,
        ): Outcome<ConversationMessages> {
            val query = listOf("page" to page.toString(), "limit" to MESSAGE_PAGE_SIZE.toString())
            return client.send(ApiRequest.get<ConversationMessages>("/api/ai/conversations/$id/messages", query)).value()
        }

        override suspend fun send(
            request: ChatRequest,
            onEvent: (ChatEvent) -> Unit,
        ): Outcome<Unit> = client.stream("/api/ai/chat", request, onEvent)

        override suspend fun record(outcome: DraftOutcome): Outcome<Unit> =
            client.send(ApiRequest.post<OutcomeRecorded, DraftOutcome>("/api/feedback/outcomes", outcome)).value().map { }

        private companion object {
            const val LIST_PAGE_SIZE = 20
        }
    }
