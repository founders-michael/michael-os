package com.michaelos.core.data

import com.michaelos.core.model.CheckInRequest
import com.michaelos.core.model.CheckInResponse
import com.michaelos.core.model.Habit
import com.michaelos.core.model.HabitCreate
import com.michaelos.core.model.HabitList
import com.michaelos.core.model.HabitResponse
import com.michaelos.core.model.HabitSave
import com.michaelos.core.model.HabitStatus
import com.michaelos.core.model.HabitStatusChange
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.SuccessResponse
import com.michaelos.core.network.ApiClient
import com.michaelos.core.network.ApiRequest
import java.time.LocalDate
import javax.inject.Inject

interface HabitRepository {
    /** Unpaginated on the server. A null status lists both. */
    suspend fun list(status: HabitStatus? = null): Outcome<List<Habit>>

    suspend fun habit(id: String): Outcome<Habit>

    /** Safe to repeat: a second check-in for the same date answers with the first. */
    suspend fun checkIn(
        habitId: String,
        date: LocalDate,
    ): Outcome<CheckInResponse>

    suspend fun undoCheckIn(
        habitId: String,
        checkInId: String,
    ): Outcome<Unit>

    suspend fun create(habit: HabitCreate): Outcome<Habit>

    /** Creates a habit when [id] is null, or saves the habit form over an existing one. */
    suspend fun save(
        habit: HabitSave,
        id: String?,
    ): Outcome<Habit>

    suspend fun setStatus(
        id: String,
        status: HabitStatus,
    ): Outcome<Habit>

    /** Removes the habit and its check-ins. */
    suspend fun delete(id: String): Outcome<Unit>
}

class RemoteHabitRepository
    @Inject
    constructor(
        private val client: ApiClient,
    ) : HabitRepository {
        override suspend fun checkIn(
            habitId: String,
            date: LocalDate,
        ): Outcome<CheckInResponse> =
            when (
                val outcome =
                    client.send(ApiRequest.post<CheckInResponse, CheckInRequest>("/api/habits/$habitId/check-ins", CheckInRequest(date)))
            ) {
                is Outcome.Success -> Outcome.Success(outcome.value.value)
                is Outcome.Failure -> outcome
            }

        override suspend fun undoCheckIn(
            habitId: String,
            checkInId: String,
        ): Outcome<Unit> =
            when (val outcome = client.send(ApiRequest.delete<SuccessResponse>("/api/habits/$habitId/check-ins/$checkInId"))) {
                is Outcome.Success -> Outcome.Success(Unit)
                is Outcome.Failure -> outcome
            }

        override suspend fun create(habit: HabitCreate): Outcome<Habit> =
            client.send(ApiRequest.post<HabitResponse, HabitCreate>("/api/habits", habit)).value().map { it.habit }

        override suspend fun list(status: HabitStatus?): Outcome<List<Habit>> =
            client
                .send(
                    ApiRequest.get<HabitList>("/api/habits", listOfNotNull(status?.let { "status" to it.wire })),
                ).value()
                .map { it.habits }

        override suspend fun habit(id: String): Outcome<Habit> =
            client.send(ApiRequest.get<HabitResponse>("/api/habits/$id")).value().map { it.habit }

        override suspend fun save(
            habit: HabitSave,
            id: String?,
        ): Outcome<Habit> {
            val request =
                if (id == null) {
                    ApiRequest.post<HabitResponse, HabitSave>("/api/habits", habit)
                } else {
                    ApiRequest.patch<HabitResponse, HabitSave>("/api/habits/$id", habit)
                }
            return client.send(request).value().map { it.habit }
        }

        override suspend fun setStatus(
            id: String,
            status: HabitStatus,
        ): Outcome<Habit> =
            client
                .send(
                    ApiRequest.patch<HabitResponse, HabitStatusChange>("/api/habits/$id", HabitStatusChange(status)),
                ).value()
                .map { it.habit }

        override suspend fun delete(id: String): Outcome<Unit> =
            client.send(ApiRequest.delete<SuccessResponse>("/api/habits/$id")).value().map { }
    }
