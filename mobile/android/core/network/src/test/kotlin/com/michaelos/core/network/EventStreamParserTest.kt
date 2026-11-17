package com.michaelos.core.network

import com.michaelos.core.model.ChatEvent
import com.michaelos.core.model.ChatStreamError
import com.michaelos.core.model.ToolActivity
import com.michaelos.core.model.ToolStatus
import com.michaelos.core.testing.ContractExamples
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class EventStreamParserTest {
    private fun events(vararg chunks: ByteArray): List<ChatEvent> {
        val parser = EventStreamParser(log = {})
        return chunks.flatMap { parser.push(it) }
    }

    private val progress =
        listOf(
            ChatEvent.Accepted,
            ChatEvent.ToolStart("get_daily_overview"),
            ChatEvent.ToolEnd("get_daily_overview", ToolStatus.Completed),
            ChatEvent.Composing,
            ChatEvent.Ping,
        )

    @Test
    fun savedStreamDecodesInOrder() {
        val parsed = events(ContractExamples.exampleBytes("ai-chat-stream.sse"))
        assertEquals(6, parsed.size)
        assertEquals(progress, parsed.take(5))
        val reply = (parsed.last() as ChatEvent.Message).reply
        assertTrue(reply.content.startsWith("Based on your daily overview"))
        assertTrue(reply.content.contains("9:30 AM – 6:00 PM"))
        assertEquals(listOf(ToolActivity("get_daily_overview", ToolStatus.Completed)), reply.toolActivity)
        assertTrue(reply.usedSavedData)
    }

    @Test
    fun everySplitPointGivesTheSameEvents() {
        for (name in listOf("ai-chat-stream.sse", "ai-chat-stream-draft.sse")) {
            val bytes = ContractExamples.exampleBytes(name)
            val whole = events(bytes)
            assertTrue(whole.isNotEmpty())
            for (split in 0..bytes.size) {
                assertEquals("$name split at $split", whole, events(bytes.copyOfRange(0, split), bytes.copyOfRange(split, bytes.size)))
            }
            assertEquals(whole, events(*bytes.map { byteArrayOf(it) }.toTypedArray()))
        }
    }

    @Test
    fun splitInsideMultiByteCharacter() {
        val frame = "data: {\"type\":\"tool-start\",\"name\":\"café – ✅\"}\n\n".toByteArray()
        val dash = frame.indexOf(0xE2.toByte())
        assertEquals(
            listOf(ChatEvent.ToolStart("café – ✅")),
            events(frame.copyOfRange(0, dash + 1), frame.copyOfRange(dash + 1, frame.size)),
        )
    }

    @Test
    fun crlfLineEndings() {
        val text = ContractExamples.example("ai-chat-stream-draft.sse")
        assertEquals(events(text.toByteArray()), events(text.replace("\n", "\r\n").toByteArray()))
    }

    @Test
    fun unknownTypesAndCommentsAreIgnored() {
        val text = "data: {\"type\":\"reasoning\",\"text\":\"…\"}\n\n: keep-alive\n\nevent: x\nid: 4\ndata: {\"type\":\"accepted\"}\n\n"
        assertEquals(listOf(ChatEvent.Accepted), events(text.toByteArray()))
    }

    @Test
    fun dataLinesOfOneEventAreJoined() {
        assertEquals(listOf(ChatEvent.Composing), events("data: {\"type\":\ndata: \"composing\"}\n\n".toByteArray()))
    }

    @Test
    fun malformedKnownEventIsDroppedAndLogged() {
        val lines = mutableListOf<String>()
        val parser = EventStreamParser(log = { lines += it })
        assertEquals(listOf(ChatEvent.Ping), parser.push("data: {\"type\":\"tool-start\"}\n\ndata: {\"type\":\"ping\"}\n\n".toByteArray()))
        assertEquals(1, lines.size)
    }

    @Test
    fun errorEvent() {
        val text = "data: {\"type\":\"error\",\"code\":\"AI_TIMEOUT\",\"message\":\"Michael took too long.\",\"retryAfterSeconds\":5}\n\n"
        assertEquals(listOf(ChatEvent.Error(ChatStreamError("AI_TIMEOUT", "Michael took too long.", 5))), events(text.toByteArray()))
    }

    @Test
    fun streamClosingWithoutReplyYieldsNoMessage() {
        val bytes = ContractExamples.exampleBytes("ai-chat-stream.sse")
        assertEquals(progress, events(bytes.copyOfRange(0, bytes.size - 2)))
    }
}
