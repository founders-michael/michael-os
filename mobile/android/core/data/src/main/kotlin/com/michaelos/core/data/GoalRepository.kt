package com.michaelos.core.data

import com.michaelos.core.model.Goal
import com.michaelos.core.model.GoalChange
import com.michaelos.core.model.GoalCreate
import com.michaelos.core.model.GoalList
import com.michaelos.core.model.GoalResponse
import com.michaelos.core.model.GoalSave
import com.michaelos.core.model.GoalStatus
import com.michaelos.core.model.GoalSummaryResponse
import com.michaelos.core.model.MilestoneChange
import com.michaelos.core.model.MilestoneCreate
import com.michaelos.core.model.MilestoneResponse
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.SuccessResponse
import com.michaelos.core.network.ApiClient
import com.michaelos.core.network.ApiRequest
import java.time.LocalDate
import javax.inject.Inject

interface GoalRepository {
    suspend fun create(goal: GoalCreate): Outcome<Goal>

    /** Unpaginated on the server, newest first. A null status lists every goal. */
    suspend fun list(status: GoalStatus? = null): Outcome<List<Goal>>

    suspend fun goal(id: String): Outcome<Goal>

    /** The server's date in the profile's zone. */
    suspend fun today(): Outcome<LocalDate>

    /** Creates a goal when [id] is null, or saves the goal form over an existing one. */
    suspend fun save(
        goal: GoalSave,
        id: String?,
    ): Outcome<Goal>

    suspend fun change(
        id: String,
        change: GoalChange,
    ): Outcome<Goal>

    /** Removes the goal and its milestones. */
    suspend fun delete(id: String): Outcome<Unit>

    suspend fun addMilestone(
        goalId: String,
        milestone: MilestoneCreate,
    ): Outcome<Unit>

    suspend fun changeMilestone(
        goalId: String,
        milestoneId: String,
        change: MilestoneChange,
    ): Outcome<Unit>

    suspend fun deleteMilestone(
        goalId: String,
        milestoneId: String,
    ): Outcome<Unit>
}

class RemoteGoalRepository
    @Inject
    constructor(
        private val client: ApiClient,
    ) : GoalRepository {
        override suspend fun create(goal: GoalCreate): Outcome<Goal> =
            client.send(ApiRequest.post<GoalResponse, GoalCreate>("/api/goals", goal)).value().map { it.goal }

        override suspend fun list(status: GoalStatus?): Outcome<List<Goal>> =
            client
                .send(ApiRequest.get<GoalList>("/api/goals", listOfNotNull(status?.let { "status" to it.wire })))
                .value()
                .map { it.goals }

        override suspend fun goal(id: String): Outcome<Goal> =
            client.send(ApiRequest.get<GoalResponse>("/api/goals/$id")).value().map { it.goal }

        override suspend fun today(): Outcome<LocalDate> =
            client.send(ApiRequest.get<GoalSummaryResponse>("/api/goals/summary")).value().map { it.summary.today }

        override suspend fun save(
            goal: GoalSave,
            id: String?,
        ): Outcome<Goal> {
            val request =
                if (id == null) {
                    ApiRequest.post<GoalResponse, GoalSave>("/api/goals", goal)
                } else {
                    ApiRequest.patch<GoalResponse, GoalSave>("/api/goals/$id", goal)
                }
            return client.send(request).value().map { it.goal }
        }

        override suspend fun change(
            id: String,
            change: GoalChange,
        ): Outcome<Goal> = client.send(ApiRequest.patch<GoalResponse, GoalChange>("/api/goals/$id", change)).value().map { it.goal }

        override suspend fun delete(id: String): Outcome<Unit> =
            client.send(ApiRequest.delete<SuccessResponse>("/api/goals/$id")).value().map { }

        override suspend fun addMilestone(
            goalId: String,
            milestone: MilestoneCreate,
        ): Outcome<Unit> =
            client
                .send(ApiRequest.post<MilestoneResponse, MilestoneCreate>("/api/goals/$goalId/milestones", milestone))
                .value()
                .map { }

        override suspend fun changeMilestone(
            goalId: String,
            milestoneId: String,
            change: MilestoneChange,
        ): Outcome<Unit> =
            client
                .send(ApiRequest.patch<MilestoneResponse, MilestoneChange>("/api/goals/$goalId/milestones/$milestoneId", change))
                .value()
                .map { }

        override suspend fun deleteMilestone(
            goalId: String,
            milestoneId: String,
        ): Outcome<Unit> =
            client.send(ApiRequest.delete<SuccessResponse>("/api/goals/$goalId/milestones/$milestoneId")).value().map { }
    }
