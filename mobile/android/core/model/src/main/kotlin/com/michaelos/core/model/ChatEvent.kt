package com.michaelos.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * One event from `POST /api/ai/chat` with `stream: true`. The server sends progress and then the whole reply
 * once; it never streams tokens.
 */
sealed interface ChatEvent {
    data object Accepted : ChatEvent

    data class ToolStart(
        val name: String,
    ) : ChatEvent

    data class ToolEnd(
        val name: String,
        val status: ToolStatus,
    ) : ChatEvent

    data object Composing : ChatEvent

    data object Ping : ChatEvent

    data class Message(
        val reply: ChatReply,
    ) : ChatEvent

    data class Error(
        val error: ChatStreamError,
    ) : ChatEvent

    companion object {
        /**
         * Returns null for an event type this build does not know, so the server can add types without breaking
         * shipped apps. Throws when a known type's fields do not match.
         */
        fun decode(data: String): ChatEvent? {
            val element = apiJson.parseToJsonElement(data)
            return when (element.jsonObject["type"]?.jsonPrimitive?.content) {
                "accepted" -> Accepted
                "tool-start" -> ToolStart(element.decode<Tool>().name)
                "tool-end" -> element.decode<Tool>().let { ToolEnd(it.name, it.status ?: ToolStatus.Unknown) }
                "composing" -> Composing
                "ping" -> Ping
                "message" -> Message(element.decode())
                "error" -> Error(element.decode())
                else -> null
            }
        }

        private inline fun <reified T> JsonElement.decode(): T = apiJson.decodeFromJsonElement(this)
    }

    @Serializable
    private data class Tool(
        val name: String,
        val status: ToolStatus? = null,
    )
}

@Serializable
data class ChatReply(
    val content: String,
    val toolActivity: List<ToolActivity>,
    val usedSavedData: Boolean,
    val drafts: List<RecordDraft> = emptyList(),
    val planningProposal: PlanningProposal? = null,
)

@Serializable
data class ToolActivity(
    val name: String,
    val status: ToolStatus,
)

@Serializable(with = ToolStatusSerializer::class)
enum class ToolStatus(
    override val wire: String,
) : OpenEnum {
    Completed("completed"),
    Unavailable("unavailable"),
    Failed("failed"),
    Unknown("unknown"),
}

internal object ToolStatusSerializer : OpenEnumSerializer<ToolStatus>("ToolStatus", ToolStatus.entries, ToolStatus.Unknown)

@Serializable
data class ChatStreamError(
    val code: String,
    val message: String,
    val retryAfterSeconds: Int? = null,
)
