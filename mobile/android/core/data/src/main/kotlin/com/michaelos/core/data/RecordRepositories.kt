package com.michaelos.core.data

import com.michaelos.core.model.CalendarEvent
import com.michaelos.core.model.CalendarEventCreate
import com.michaelos.core.model.CalendarEventResponse
import com.michaelos.core.model.Memory
import com.michaelos.core.model.MemoryCreate
import com.michaelos.core.model.MemoryResponse
import com.michaelos.core.model.Outcome
import com.michaelos.core.network.ApiClient
import com.michaelos.core.network.ApiRequest
import com.michaelos.core.network.ApiResponse
import javax.inject.Inject

interface CalendarRepository {
    /** Refused with `Conflict` when the event overlaps another. */
    suspend fun create(event: CalendarEventCreate): Outcome<CalendarEvent>
}

class RemoteCalendarRepository
    @Inject
    constructor(
        private val client: ApiClient,
    ) : CalendarRepository {
        override suspend fun create(event: CalendarEventCreate): Outcome<CalendarEvent> =
            client.send(ApiRequest.post<CalendarEventResponse, CalendarEventCreate>("/api/calendar/events", event)).value().map { it.event }
    }

interface MemoryRepository {
    suspend fun create(memory: MemoryCreate): Outcome<Memory>
}

class RemoteMemoryRepository
    @Inject
    constructor(
        private val client: ApiClient,
    ) : MemoryRepository {
        override suspend fun create(memory: MemoryCreate): Outcome<Memory> =
            client.send(ApiRequest.post<MemoryResponse, MemoryCreate>("/api/memories", memory)).value().map { it.memory }
    }

internal fun <T> Outcome<ApiResponse<T>>.value(): Outcome<T> = map { it.value }

internal inline fun <T, R> Outcome<T>.map(transform: (T) -> R): Outcome<R> =
    when (this) {
        is Outcome.Success -> Outcome.Success(transform(value))
        is Outcome.Failure -> this
    }
