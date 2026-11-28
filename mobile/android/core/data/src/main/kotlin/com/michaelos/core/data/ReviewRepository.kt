package com.michaelos.core.data

import com.michaelos.core.model.CarryForward
import com.michaelos.core.model.CarryForwardResponse
import com.michaelos.core.model.DailyReview
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.ReflectionResponse
import com.michaelos.core.model.ReflectionSave
import com.michaelos.core.network.ApiClient
import com.michaelos.core.network.ApiRequest
import java.time.LocalDate
import javax.inject.Inject

interface ReviewRepository {
    /** A null date reads today in the profile's zone. */
    suspend fun review(date: LocalDate?): Outcome<DailyReview>

    suspend fun save(reflection: ReflectionSave): Outcome<Unit>

    /** The date the task now has, null when left unscheduled. */
    suspend fun carryForward(move: CarryForward): Outcome<LocalDate?>
}

class RemoteReviewRepository
    @Inject
    constructor(
        private val client: ApiClient,
    ) : ReviewRepository {
        override suspend fun review(date: LocalDate?): Outcome<DailyReview> =
            client
                .send(
                    ApiRequest.get<DailyReview>("/api/lifestyle/daily-review", listOfNotNull(date?.let { "date" to it.toString() })),
                ).value()

        override suspend fun save(reflection: ReflectionSave): Outcome<Unit> =
            client.send(ApiRequest.put<ReflectionResponse, ReflectionSave>("/api/lifestyle/daily-review", reflection)).value().map { }

        override suspend fun carryForward(move: CarryForward): Outcome<LocalDate?> =
            client
                .send(ApiRequest.post<CarryForwardResponse, CarryForward>("/api/lifestyle/daily-review/carry-forward", move))
                .value()
                .map { it.result.targetDate }
    }
