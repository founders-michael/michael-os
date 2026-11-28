package com.michaelos.core.model

import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

@Serializable(with = DraftKindSerializer::class)
enum class DraftKind(
    override val wire: String,
) : OpenEnum {
    Task("task"),
    Goal("goal"),
    Habit("habit"),
    CalendarEvent("calendarEvent"),
    Memory("memory"),
    Unknown("unknown"),
}

internal object DraftKindSerializer : OpenEnumSerializer<DraftKind>("DraftKind", DraftKind.entries, DraftKind.Unknown)

/** A value Michael filled in. The draft tools normalise every value to one of these shapes. */
sealed interface DraftValue {
    data class Text(
        val text: String,
    ) : DraftValue

    data class Number(
        val number: Int,
    ) : DraftValue

    data class Days(
        val days: List<Int>,
    ) : DraftValue
}

/**
 * An unsaved record Michael proposed. Nothing is saved until the user presses Save, which posts the edited values
 * to the kind's own create endpoint.
 */
@Serializable(with = RecordDraftSerializer::class)
data class RecordDraft(
    val kind: DraftKind,
    val values: Map<String, DraftValue>,
    val timeZone: String,
)

internal object RecordDraftSerializer : KSerializer<RecordDraft> {
    override val descriptor: SerialDescriptor = JsonObject.serializer().descriptor

    override fun deserialize(decoder: Decoder): RecordDraft {
        val json = (decoder as JsonDecoder).decodeJsonElement().jsonObject
        val kind = json["kind"]?.jsonPrimitive?.contentOrNull
        // A value of a shape this build does not know leaves its field empty for the user to fill in, rather than
        // failing the whole reply.
        val values =
            json["values"]?.jsonObject.orEmpty().mapNotNull { (name, element) ->
                val value =
                    when {
                        element is JsonPrimitive && element.isString -> {
                            DraftValue.Text(element.content)
                        }

                        element is JsonPrimitive -> {
                            element.intOrNull?.let(DraftValue::Number)
                        }

                        element is JsonArray -> {
                            element
                                .map { (it as? JsonPrimitive)?.takeUnless(JsonPrimitive::isString)?.intOrNull }
                                .takeIf { days -> days.none { it == null } }
                                ?.let { days -> DraftValue.Days(days.filterNotNull()) }
                        }

                        else -> {
                            null
                        }
                    }
                value?.let { name to it }
            }
        return RecordDraft(
            kind = DraftKind.entries.firstOrNull { it.wire == kind } ?: DraftKind.Unknown,
            values = values.toMap(),
            timeZone = json.getValue("timeZone").jsonPrimitive.content,
        )
    }

    override fun serialize(
        encoder: Encoder,
        value: RecordDraft,
    ) = error("A draft is only received")
}
