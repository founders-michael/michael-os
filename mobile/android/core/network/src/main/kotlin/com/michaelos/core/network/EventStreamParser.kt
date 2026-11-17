package com.michaelos.core.network

import android.util.Log
import com.michaelos.core.model.ChatEvent
import kotlinx.serialization.SerializationException
import java.io.ByteArrayOutputStream

/**
 * Turns the bytes of a `text/event-stream` body into chat events. Reads can split a frame, or a multi-byte
 * character, anywhere, so bytes are buffered until a whole line has arrived and decoded only when a blank line
 * ends the event. An event cut off by the end of the stream is never dispatched, as the SSE spec says.
 */
class EventStreamParser(
    private val log: (String) -> Unit = { Log.d("api", it) },
) {
    private val line = ByteArrayOutputStream()
    private val data = ByteArrayOutputStream()

    fun push(
        bytes: ByteArray,
        offset: Int = 0,
        length: Int = bytes.size - offset,
    ): List<ChatEvent> {
        val events = mutableListOf<ChatEvent>()
        for (index in offset until offset + length) {
            val byte = bytes[index]
            if (byte == NEWLINE) {
                endLine()?.let(events::add)
            } else {
                line.write(byte.toInt())
            }
        }
        return events
    }

    private fun endLine(): ChatEvent? {
        var current = line.toByteArray()
        line.reset()
        if (current.lastOrNull() == CARRIAGE_RETURN) current = current.copyOf(current.size - 1)
        if (current.isEmpty()) return dispatch()
        if (!current.startsWith(DATA_FIELD)) return null
        var start = DATA_FIELD.size
        if (current.getOrNull(start) == SPACE) start += 1
        if (data.size() > 0) data.write(NEWLINE.toInt())
        data.write(current, start, current.size - start)
        return null
    }

    private fun dispatch(): ChatEvent? {
        if (data.size() == 0) return null
        val payload = data.toString(Charsets.UTF_8.name())
        data.reset()
        return try {
            ChatEvent.decode(payload)
        } catch (_: SerializationException) {
            log("Chat event did not match its model")
            null
        } catch (_: IllegalArgumentException) {
            log("Chat event did not match its model")
            null
        }
    }

    private fun ByteArray.startsWith(prefix: ByteArray) = size >= prefix.size && prefix.indices.all { this[it] == prefix[it] }

    private companion object {
        const val NEWLINE = '\n'.code.toByte()
        const val CARRIAGE_RETURN = '\r'.code.toByte()
        const val SPACE = ' '.code.toByte()
        val DATA_FIELD = "data:".toByteArray()
    }
}
