package com.michaelos.core.data

import com.michaelos.core.model.MyDay
import com.michaelos.core.model.Outcome
import com.michaelos.core.network.ApiClient
import com.michaelos.core.network.ApiRequest
import java.time.LocalDate
import javax.inject.Inject

interface MyDayRepository {
    /** Null asks for the server's today in the profile's time zone. */
    suspend fun day(date: LocalDate?): Outcome<MyDay>
}

class RemoteMyDayRepository
    @Inject
    constructor(
        private val client: ApiClient,
    ) : MyDayRepository {
        override suspend fun day(date: LocalDate?): Outcome<MyDay> {
            val query = date?.let { listOf("date" to it.toString()) }.orEmpty()
            return when (val outcome = client.send(ApiRequest.get<MyDay>("/api/my-day", query))) {
                is Outcome.Success -> Outcome.Success(outcome.value.value)
                is Outcome.Failure -> outcome
            }
        }
    }
