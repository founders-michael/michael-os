package com.michaelos.feature.assistant

import com.michaelos.core.model.AppError
import com.michaelos.core.model.Conversation
import com.michaelos.core.model.ConversationFilter
import com.michaelos.core.model.ConversationUpdate
import com.michaelos.core.testing.FakeAssistantRepository
import com.michaelos.core.testing.MainDispatcherRule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.time.Instant

class HistoryViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private fun conversation(
        index: Int,
        archived: Boolean = false,
    ) = Conversation("c$index", "Chat $index", 2, Instant.EPOCH, if (archived) Instant.EPOCH else null, Instant.EPOCH)

    private val HistoryViewModel.content get() = uiState.value as HistoryUiState.Content

    @Test
    fun theFirstPageLoadsAndScrollingToTheEndLoadsTheNext() {
        val assistant = FakeAssistantRepository((1..25).map { conversation(it) })
        val model = HistoryViewModel(assistant)
        model.load()
        assertEquals(20, model.content.conversations.size)
        assertEquals(2, model.content.nextPage)
        model.loadMore()
        assertEquals(25, model.content.conversations.size)
        assertNull(model.content.nextPage)
    }

    @Test
    fun noConversationsIsEmptyAndAFailureCanBeRetried() {
        val assistant = FakeAssistantRepository()
        val model = HistoryViewModel(assistant)
        model.load()
        assertEquals(HistoryUiState.Empty, model.uiState.value)
        assistant.failNext(AppError.Offline)
        model.load()
        assertEquals(HistoryUiState.Failed(AppError.Offline), model.uiState.value)
    }

    @Test
    fun renameUsesTheServersTitleAndArchiveMovesItToTheArchivedList() {
        val assistant = FakeAssistantRepository(listOf(conversation(1), conversation(2), conversation(3, archived = true)))
        val model = HistoryViewModel(assistant)
        model.load()
        var renamed: Conversation? = null
        model.rename("c1", "  Plan the week  ") { renamed = it }
        assertEquals("Plan the week", renamed?.title)
        assertEquals(
            "Plan the week",
            model.content.conversations
                .first()
                .title,
        )
        model.setArchived("c2", archived = true)
        assertEquals(listOf("c1"), model.content.conversations.map { it.id })
        model.show(ConversationFilter.Archived)
        assertEquals(
            setOf("c2", "c3"),
            model.content.conversations
                .map { it.id }
                .toSet(),
        )
        assertTrue(assistant.calls.contains(FakeAssistantRepository.Call.Update("c2", ConversationUpdate.Archive(true))))
    }

    @Test
    fun deleteWaitsForTheServerAndARefusalIsShown() {
        val assistant = FakeAssistantRepository(listOf(conversation(1), conversation(2)))
        val model = HistoryViewModel(assistant)
        model.load()
        var deleted = false
        assistant.failNext(AppError.Offline)
        model.delete("c1") { deleted = true }
        assertEquals(Reason.Local(R.string.history_error_offline), model.content.error)
        assertEquals(2, model.content.conversations.size)
        model.delete("c1") { deleted = true }
        assertTrue(deleted)
        assertEquals(listOf("c2"), model.content.conversations.map { it.id })
        model.delete("c2") {}
        assertEquals(HistoryUiState.Empty, model.uiState.value)
    }
}
