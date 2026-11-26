@file:UseSerializers(LocalDateSerializer::class)

package com.michaelos.core.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.UseSerializers
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import java.time.LocalDate

/** One open task in Michael's order (`GET /api/tasks/priorities`). The ranking never edits a task. */
@Serializable
data class RankedTask(
    val rank: Int,
    val score: Double,
    /** False when the task waits on unfinished work; such tasks come after the ones that can start now. */
    val actionable: Boolean,
    val blockedReason: PriorityReason? = null,
    val components: List<PriorityComponent>,
    val task: Task,
)

/** One part of the published formula (`shared/intelligence/prioritization.json`) and what it found for this task. */
@Serializable
data class PriorityComponent(
    val name: String,
    val applicable: Boolean,
    val weight: Double,
    val contribution: Double? = null,
    val reason: PriorityReason,
)

/** A reason code with the values its wording needs (`days`, `count`, `priority`, ...). The fields vary by code. */
@Serializable(with = PriorityReasonSerializer::class)
data class PriorityReason(
    val code: String,
    val numbers: Map<String, Double> = emptyMap(),
    val strings: Map<String, String> = emptyMap(),
)

internal object PriorityReasonSerializer : KSerializer<PriorityReason> {
    override val descriptor: SerialDescriptor = JsonObject.serializer().descriptor

    override fun deserialize(decoder: Decoder): PriorityReason {
        val json = (decoder as JsonDecoder).decodeJsonElement() as JsonObject
        val fields = json.filterKeys { it != "code" }.mapValues { it.value as? JsonPrimitive }
        return PriorityReason(
            code = (json["code"] as? JsonPrimitive)?.content.orEmpty(),
            numbers = fields.mapNotNull { (key, value) -> value?.takeUnless { it.isString }?.doubleOrNull?.let { key to it } }.toMap(),
            strings = fields.mapNotNull { (key, value) -> value?.takeIf { it.isString }?.let { key to it.content } }.toMap(),
        )
    }

    override fun serialize(
        encoder: Encoder,
        value: PriorityReason,
    ) = error("PriorityReason is only read")
}

@Serializable
data class PrioritiesPage(
    val tasks: List<RankedTask>,
    val page: Int,
    val pages: Int,
    val total: Int,
    val openTasks: Int,
    val truncated: Boolean,
)

/** A goal a task supports, as `GET /api/tasks/{id}/goals` returns it. */
@Serializable
data class GoalLink(
    val id: String,
    val title: String,
    val status: GoalStatus,
    val targetDate: LocalDate? = null,
)

@Serializable
data class GoalLinks(
    val goals: List<GoalLink>,
)

@Serializable
data class GoalLinksUpdate(
    val goalIds: List<String>,
)

@Serializable
data class GoalList(
    val goals: List<Goal>,
)

/** A category in the registry (`/api/taxonomy`). `entityTypes` says which records it may hold. */
@Serializable
data class TaxonomyCategory(
    val key: String,
    val name: String,
    val entityTypes: List<String> = emptyList(),
)

@Serializable
data class TaxonomyResponse(
    val categories: List<TaxonomyCategory>,
)

/** One record placed in one category. `inferred` marks Michael's suggestion, which stays one until confirmed. */
@Serializable
data class Classification(
    val id: String,
    val category: Category,
    val inferred: Boolean,
    val confidence: Double? = null,
) {
    @Serializable
    data class Category(
        val key: String,
        val name: String,
        val active: Boolean = true,
    )
}

@Serializable
data class ClassificationList(
    val classifications: List<Classification>,
)

@Serializable
data class ClassificationResponse(
    val classification: Classification,
)

/** Null when Michael found no category that clearly fits. */
@Serializable
data class SuggestionResponse(
    val suggestion: Classification? = null,
)

@Serializable
data class ClassificationCreate(
    val entityId: String,
    val categoryKey: String,
    val entityType: String = "TASK",
)

@Serializable
data class SuggestionRequest(
    val entityId: String,
    val dataUseAcknowledged: Boolean,
    val entityType: String = "TASK",
)
