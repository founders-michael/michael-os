@file:UseSerializers(InstantSerializer::class, LocalDateSerializer::class)
@file:OptIn(ExperimentalSerializationApi::class)

package com.michaelos.core.model

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.UseSerializers
import kotlinx.serialization.builtins.nullable
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import java.time.Instant
import java.time.LocalDate

/**
 * `POST /api/calendar/plan` and the chat's `planningProposal`: sessions the planner suggests, none of them saved.
 * [approvalToken] is the only thing that can apply them; it is kept in memory with the proposal and never logged.
 */
@Serializable
data class PlanningProposal(
    val timeZone: String,
    val proposedActivities: List<ProposedSession>,
    val taskDetails: List<PlannedTask>,
    val unscheduledTasks: List<UnplannedTask> = emptyList(),
    val warnings: List<PlanWarning> = emptyList(),
    val approvalToken: String,
    val approvalExpiresAt: Instant,
) {
    // Leaves the token out, so no log line can carry it.
    override fun toString(): String = "PlanningProposal(${proposedActivities.size} sessions)"
}

@Serializable
data class ProposedSession(
    /** What the apply call names; the created event takes it as its id. */
    val selectionId: String,
    val taskId: String,
    val startAt: Instant,
    val endAt: Instant,
    val sessionIndex: Int = 1,
    val sessionCount: Int = 1,
)

@Serializable
data class PlannedTask(
    val id: String,
    val title: String,
)

/** A task the planner could not place. [reason] is a sentence for the user. */
@Serializable
data class UnplannedTask(
    val taskId: String,
    val reasonCode: String,
    val reason: String,
)

/** [message] is a sentence for the user; [code] decides behaviour. */
@Serializable
data class PlanWarning(
    val code: String,
    val message: String,
)

@Serializable
data class PlanningProposalResponse(
    val proposal: PlanningProposal,
)

/** `POST /api/calendar/plan`: up to seven dates, starting today or later. */
@Serializable
data class PlanRequest(
    val fromDate: LocalDate,
    val toDate: LocalDate,
)

@Serializable
data class PlanApply(
    val approvalToken: String,
    val selectedSessionIds: List<String>,
) {
    override fun toString(): String = "PlanApply(${selectedSessionIds.size} sessions)"
}

@Serializable
data class PlanApplyResult(
    val createdCount: Int,
)

@Serializable
data class PlanApplyResponse(
    val result: PlanApplyResult,
)

internal object LenientProposalSerializer : KSerializer<PlanningProposal?> {
    override val descriptor: SerialDescriptor = PlanningProposal.serializer().nullable.descriptor

    override fun deserialize(decoder: Decoder): PlanningProposal? {
        val element = (decoder as? JsonDecoder)?.decodeJsonElement() ?: return null
        return try {
            decoder.json.decodeFromJsonElement(PlanningProposal.serializer(), element)
        } catch (_: SerializationException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }
    }

    override fun serialize(
        encoder: Encoder,
        value: PlanningProposal?,
    ) = error("A proposal is only received")
}

internal object TaskLinkSerializer : KSerializer<TaskLink> {
    private val inner = String.serializer().nullable
    override val descriptor: SerialDescriptor = inner.descriptor

    override fun deserialize(decoder: Decoder): TaskLink = TaskLink(inner.deserialize(decoder))

    override fun serialize(
        encoder: Encoder,
        value: TaskLink,
    ) = inner.serialize(encoder, value.id)
}
