package com.michaelos.core.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.time.format.ResolverStyle

/** Unknown fields are ignored so the web app can add fields without breaking shipped apps. */
val apiJson: Json =
    Json {
        ignoreUnknownKeys = true
        // Request bodies send every field, including `callbackURL`'s fixed value and the explicit nulls the
        // profile save needs; a field left out because it held its default would be a 400.
        encodeDefaults = true
    }

/**
 * An enum decoded from a server string. A value this build does not know decodes to the enum's unknown entry
 * instead of failing the whole response.
 */
interface OpenEnum {
    val wire: String
}

abstract class OpenEnumSerializer<T>(
    name: String,
    private val entries: List<T>,
    private val unknown: T,
) : KSerializer<T> where T : Enum<T>, T : OpenEnum {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor(name, PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): T {
        val raw = decoder.decodeString()
        return entries.firstOrNull { it.wire == raw } ?: unknown
    }

    override fun serialize(
        encoder: Encoder,
        value: T,
    ) = encoder.encodeString(value.wire)
}

/** A `YYYY-MM-DD` calendar date in the profile's time zone. It is never converted to an instant. */
object LocalDateSerializer : KSerializer<LocalDate> {
    override val descriptor = PrimitiveSerialDescriptor("LocalDate", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): LocalDate = LocalDate.parse(decoder.decodeString(), DateTimeFormatter.ISO_LOCAL_DATE)

    override fun serialize(
        encoder: Encoder,
        value: LocalDate,
    ) = encoder.encodeString(value.format(DateTimeFormatter.ISO_LOCAL_DATE))
}

/** An `HH:mm` wall-clock time in the profile's time zone. */
object LocalTimeSerializer : KSerializer<LocalTime> {
    // STRICT refuses 24:00, which the default resolver rolls over to midnight.
    private val format = DateTimeFormatter.ofPattern("HH:mm").withResolverStyle(ResolverStyle.STRICT)

    override val descriptor = PrimitiveSerialDescriptor("LocalTime", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): LocalTime = LocalTime.parse(decoder.decodeString(), format)

    override fun serialize(
        encoder: Encoder,
        value: LocalTime,
    ) = encoder.encodeString(value.format(format))
}

/** Instants arrive as ISO 8601 with an offset, with or without fractional seconds. */
object InstantSerializer : KSerializer<Instant> {
    override val descriptor = PrimitiveSerialDescriptor("Instant", PrimitiveKind.STRING)

    override fun deserialize(decoder: Decoder): Instant = OffsetDateTime.parse(decoder.decodeString()).toInstant()

    override fun serialize(
        encoder: Encoder,
        value: Instant,
    ) = encoder.encodeString(value.toString())
}
