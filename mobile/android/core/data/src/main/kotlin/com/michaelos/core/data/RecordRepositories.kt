package com.michaelos.core.data

import com.michaelos.core.model.Availability
import com.michaelos.core.model.AvailabilityUpdate
import com.michaelos.core.model.CalendarEvent
import com.michaelos.core.model.CalendarEventCreate
import com.michaelos.core.model.CalendarEventResponse
import com.michaelos.core.model.CalendarEventUpdate
import com.michaelos.core.model.CalendarEventsPage
import com.michaelos.core.model.EventDeleted
import com.michaelos.core.model.Memory
import com.michaelos.core.model.MemoryCreate
import com.michaelos.core.model.MemoryResponse
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.PlanApply
import com.michaelos.core.model.PlanApplyResponse
import com.michaelos.core.model.PlanApplyResult
import com.michaelos.core.model.PlanRequest
import com.michaelos.core.model.PlanningProposal
import com.michaelos.core.model.PlanningProposalResponse
import com.michaelos.core.model.UnscheduledTask
import com.michaelos.core.model.UnscheduledTasksResponse
import com.michaelos.core.network.ApiClient
import com.michaelos.core.network.ApiRequest
import com.michaelos.core.network.ApiResponse
import java.time.Instant
import javax.inject.Inject

interface CalendarRepository {
    /** Every event overlapping [start] to [end], at most 46 days apart. */
    suspend fun events(
        start: Instant,
        end: Instant,
    ): Outcome<CalendarEventsPage>

    /** Refused with `Conflict` when the event overlaps another; the message carries the overlapped events. */
    suspend fun create(event: CalendarEventCreate): Outcome<CalendarEvent>

    /** Refused as [create] is. */
    suspend fun update(
        id: String,
        change: CalendarEventUpdate,
    ): Outcome<CalendarEvent>

    suspend fun deleteEvent(id: String): Outcome<Unit>

    suspend fun unscheduledTasks(): Outcome<List<UnscheduledTask>>

    suspend fun availability(): Outcome<Availability>

    /** Replaces the whole weekly set. */
    suspend fun saveAvailability(update: AvailabilityUpdate): Outcome<Availability>

    /** Saves nothing. */
    suspend fun plan(request: PlanRequest): Outcome<PlanningProposal>

    /** Creates the chosen sessions, or none of them. */
    suspend fun apply(approval: PlanApply): Outcome<PlanApplyResult>
}

class RemoteCalendarRepository
    @Inject
    constructor(
        private val client: ApiClient,
    ) : CalendarRepository {
        override suspend fun events(
            start: Instant,
            end: Instant,
        ): Outcome<CalendarEventsPage> =
            client
                .send(
                    ApiRequest.get<CalendarEventsPage>("/api/calendar/events", listOf("from" to start.toString(), "to" to end.toString())),
                ).value()

        override suspend fun create(event: CalendarEventCreate): Outcome<CalendarEvent> =
            client.send(ApiRequest.post<CalendarEventResponse, CalendarEventCreate>("/api/calendar/events", event)).value().map { it.event }

        override suspend fun update(
            id: String,
            change: CalendarEventUpdate,
        ): Outcome<CalendarEvent> =
            client
                .send(ApiRequest.patch<CalendarEventResponse, CalendarEventUpdate>("/api/calendar/events/$id", change))
                .value()
                .map { it.event }

        override suspend fun deleteEvent(id: String): Outcome<Unit> =
            client.send(ApiRequest.delete<EventDeleted>("/api/calendar/events/$id")).value().map { }

        override suspend fun unscheduledTasks(): Outcome<List<UnscheduledTask>> =
            client.send(ApiRequest.get<UnscheduledTasksResponse>("/api/calendar/unscheduled-tasks")).value().map { it.tasks }

        override suspend fun availability(): Outcome<Availability> =
            client.send(ApiRequest.get<Availability>("/api/calendar/availability")).value().map { it.stored() }

        override suspend fun saveAvailability(update: AvailabilityUpdate): Outcome<Availability> =
            client
                .send(ApiRequest.put<Availability, AvailabilityUpdate>("/api/calendar/availability", update))
                .value()
                .map { it.stored() }

        override suspend fun plan(request: PlanRequest): Outcome<PlanningProposal> =
            client
                .send(ApiRequest.post<PlanningProposalResponse, PlanRequest>("/api/calendar/plan", request))
                .value()
                .map { it.proposal }

        override suspend fun apply(approval: PlanApply): Outcome<PlanApplyResult> =
            client.send(ApiRequest.post<PlanApplyResponse, PlanApply>("/api/calendar/plan/apply", approval)).value().map { it.result }
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
