@file:UseSerializers(LocalTimeSerializer::class)
@file:OptIn(ExperimentalSerializationApi::class)

package com.michaelos.core.model

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.UseSerializers
import java.time.LocalTime

/** One weekly window Michael may plan in, on the clock of [timeZone]. Start is before end: no window crosses midnight. */
@Serializable
data class AvailabilityWindow(
    /**
     * Null for a window the server has not stored yet, and then left out of the body; the server's `PUT` answers
     * those with an empty id, which [Availability.stored] turns back into null.
     */
    @EncodeDefault(EncodeDefault.Mode.NEVER) val id: String? = null,
    /** ISO weekday, 1 = Monday to 7 = Sunday. */
    val weekday: Int,
    val startTime: LocalTime,
    val endTime: LocalTime,
    val timeZone: String,
    val active: Boolean = true,
)

/** `GET` / `PUT /api/calendar/availability`. [configured] is true when any window is active. */
@Serializable
data class Availability(
    val timeZone: String,
    val configured: Boolean,
    val windows: List<AvailabilityWindow>,
) {
    fun stored(): Availability = copy(windows = windows.map { if (it.id.isNullOrEmpty()) it.copy(id = null) else it })
}

/** The whole weekly set; the server replaces what it had with it. */
@Serializable
data class AvailabilityUpdate(
    val windows: List<AvailabilityWindow>,
)
