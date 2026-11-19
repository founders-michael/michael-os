package com.michaelos.core.data

import com.michaelos.core.model.CheckInRequest
import com.michaelos.core.model.CheckInResponse
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.SuccessResponse
import com.michaelos.core.network.ApiClient
import com.michaelos.core.network.ApiRequest
import java.time.LocalDate
import javax.inject.Inject

interface HabitRepository {
    /** Safe to repeat: a second check-in for the same date answers with the first. */
    suspend fun checkIn(
        habitId: String,
        date: LocalDate,
    ): Outcome<CheckInResponse>

    suspend fun undoCheckIn(
        habitId: String,
        checkInId: String,
    ): Outcome<Unit>
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
    }
