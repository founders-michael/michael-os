@file:UseSerializers(InstantSerializer::class, LocalDateSerializer::class)
@file:OptIn(ExperimentalSerializationApi::class)

package com.michaelos.core.model

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.UseSerializers
import java.time.Instant
import java.time.LocalDate

@Serializable
data class Goal(
    val id: String,
    val title: String,
    val description: String? = null,
    val category: String? = null,
    val status: GoalStatus,
    /** The user's own estimate. Milestones never move it. */
    val progress: Int,
    val targetDate: LocalDate? = null,
    val completedAt: Instant? = null,
    /** In the server's order, by position. */
    val milestones: List<GoalMilestone> = emptyList(),
    val milestoneCount: Int,
    val completedMilestoneCount: Int,
    val createdAt: Instant,
    val updatedAt: Instant,
)

@Serializable(with = GoalStatusSerializer::class)
enum class GoalStatus(
    override val wire: String,
) : OpenEnum {
    Active("ACTIVE"),
    Completed("COMPLETED"),
    Archived("ARCHIVED"),
    Unknown("unknown"),
}

internal object GoalStatusSerializer : OpenEnumSerializer<GoalStatus>("GoalStatus", GoalStatus.entries, GoalStatus.Unknown)

@Serializable
data class GoalMilestone(
    val id: String,
    val title: String,
    val description: String? = null,
    val status: MilestoneStatus,
    val position: Int,
    val completedAt: Instant? = null,
)

@Serializable(with = MilestoneStatusSerializer::class)
enum class MilestoneStatus(
    override val wire: String,
) : OpenEnum {
    Pending("PENDING"),
    Completed("COMPLETED"),
    Unknown("unknown"),
}

internal object MilestoneStatusSerializer :
    OpenEnumSerializer<MilestoneStatus>("MilestoneStatus", MilestoneStatus.entries, MilestoneStatus.Unknown)

@Serializable
data class GoalResponse(
    val goal: Goal,
)

/** A milestone call answers with the bare row, which also carries `goalId`. */
@Serializable
data class MilestoneResponse(
    val milestone: GoalMilestone,
)

/** `GET /api/goals/summary`, read for the server's "today" in the profile's zone. */
@Serializable
data class GoalSummaryResponse(
    val summary: Summary,
) {
    @Serializable
    data class Summary(
        val today: LocalDate,
    )
}

/** `POST /api/goals` from a Michael draft. */
@Serializable
data class GoalCreate(
    val title: String,
    val progress: Int,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val description: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val category: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val targetDate: LocalDate? = null,
)

/**
 * The goal form's save, for `POST /api/goals` and `PATCH /api/goals/{id}`. Empty fields are sent as null so clearing
 * reaches the server; progress is left out for a completed goal, which the server would refuse.
 */
@Serializable
data class GoalSave(
    val title: String,
    val description: String?,
    val category: String?,
    val targetDate: LocalDate?,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val progress: Int? = null,
)

/** `PATCH /api/goals/{id}` with one change: a status, or progress. */
@Serializable
data class GoalChange(
    @EncodeDefault(EncodeDefault.Mode.NEVER) val status: GoalStatus? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val progress: Int? = null,
)

@Serializable
data class MilestoneCreate(
    val title: String,
)

/** `PATCH /api/goals/{id}/milestones/{milestoneId}` with one change. */
@Serializable
data class MilestoneChange(
    @EncodeDefault(EncodeDefault.Mode.NEVER) val title: String? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val status: MilestoneStatus? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val position: Int? = null,
)
