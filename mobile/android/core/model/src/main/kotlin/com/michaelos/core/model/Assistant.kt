@file:UseSerializers(InstantSerializer::class)

package com.michaelos.core.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.UseSerializers
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonEncoder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import java.time.Instant

@Serializable
data class Conversation(
    val id: String,
    val title: String,
    val messageCount: Int,
    val lastMessageAt: Instant? = null,
    val archivedAt: Instant? = null,
    val createdAt: Instant,
)

@Serializable
data class ConversationResponse(
    val conversation: Conversation,
)

@Serializable
data class ConversationPage(
    val conversations: List<Conversation>,
    val page: Int,
    val pages: Int,
    val total: Int,
)

enum class ConversationFilter(
    val wire: String,
) {
    Active("ACTIVE"),
    Archived("ARCHIVED"),
}

@Serializable(with = MessageRoleSerializer::class)
enum class MessageRole(
    override val wire: String,
) : OpenEnum {
    User("user"),
    Assistant("assistant"),
    Unknown("unknown"),
}

internal object MessageRoleSerializer : OpenEnumSerializer<MessageRole>("MessageRole", MessageRole.entries, MessageRole.Unknown)

@Serializable
data class ConversationMessage(
    val id: String,
    val role: MessageRole,
    val content: String,
    val toolActivity: List<ToolActivity>,
    val createdAt: Instant,
)

/** Messages come oldest first, a page at a time. */
@Serializable
data class ConversationMessages(
    val conversation: Conversation,
    val messages: List<ConversationMessage>,
    val page: Int,
    val pages: Int,
)

/** `POST /api/ai/conversations`. No title: the server names the conversation after its first message. */
@Serializable
data class ConversationCreate(
    val product: String = "lifestyle",
)

/** `PATCH /api/ai/conversations/{id}`, one change at a time. The server refuses unknown fields. */
@Serializable(with = ConversationUpdateSerializer::class)
sealed interface ConversationUpdate {
    data class Rename(
        val title: String,
    ) : ConversationUpdate

    data class Archive(
        val archived: Boolean,
    ) : ConversationUpdate
}

internal object ConversationUpdateSerializer : KSerializer<ConversationUpdate> {
    override val descriptor: SerialDescriptor =
        kotlinx.serialization.json.JsonObject
            .serializer()
            .descriptor

    override fun serialize(
        encoder: Encoder,
        value: ConversationUpdate,
    ) {
        val json = encoder as JsonEncoder
        json.encodeJsonElement(
            buildJsonObject {
                when (value) {
                    is ConversationUpdate.Rename -> put("title", JsonPrimitive(value.title))
                    is ConversationUpdate.Archive -> put("archived", JsonPrimitive(value.archived))
                }
            },
        )
    }

    override fun deserialize(decoder: Decoder): ConversationUpdate = error("A conversation update is only sent")
}

@Serializable
data class ConversationDeleted(
    val deleted: Boolean,
)

/** `POST /api/ai/chat`. A stored conversation's history is loaded by the server, so none is sent. */
@Serializable
data class ChatRequest(
    val message: String,
    val conversationId: String,
    val dataUseAcknowledged: Boolean,
    val product: String = "lifestyle",
    val stream: Boolean = true,
)

/** `POST /api/feedback/outcomes`: what the user did with a draft. It carries the draft's kind, never its fields. */
@Serializable
data class DraftOutcome(
    val kind: Kind,
    val subject: DraftKind,
) {
    @Serializable
    enum class Kind {
        @kotlinx.serialization.SerialName("DRAFT_SAVED")
        Saved,

        @kotlinx.serialization.SerialName("DRAFT_DISCARDED")
        Discarded,
    }
}

@Serializable
data class OutcomeRecorded(
    val recorded: Boolean,
)
