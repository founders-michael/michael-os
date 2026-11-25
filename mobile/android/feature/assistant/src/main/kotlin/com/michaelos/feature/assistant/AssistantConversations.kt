package com.michaelos.feature.assistant

import androidx.lifecycle.viewModelScope
import com.michaelos.core.data.MESSAGE_PAGE_SIZE
import com.michaelos.core.model.AppError
import com.michaelos.core.model.ConversationMessage
import com.michaelos.core.model.ConversationMessages
import com.michaelos.core.model.MessageRole
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.ToolStatus
import kotlinx.coroutines.launch

/**
 * Opens a stored conversation at its newest messages. [knownCount] comes from the history list and saves a read;
 * without it the first page says how many pages there are.
 */
fun AssistantViewModel.open(
    id: String,
    knownCount: Int?,
) {
    if (isBusy) return
    viewModelScope.launch { openNow(id, knownCount) }
}

internal suspend fun AssistantViewModel.openNow(
    id: String,
    knownCount: Int?,
) {
    readGeneration += 1
    val generation = readGeneration
    mutableState.value = AssistantUiState.Opening
    val pages = newestPages(id, knownCount)
    if (generation != readGeneration) return
    mutableState.value =
        when (pages) {
            is Outcome.Failure -> {
                AssistantUiState.Failed(pages.error, id)
            }

            is Outcome.Success -> {
                val first = pages.value.first().page
                AssistantUiState.Chat(
                    ChatContent(
                        conversation = pages.value.last().conversation,
                        entries = pages.value.flatMap { it.messages }.mapNotNull(::entryOf),
                        earlierPage = if (first > 1) first - 1 else null,
                    ),
                )
            }
        }
}

/** The newest page, and the one before it when the newest holds only a few messages, so a chat never opens near-empty. */
private suspend fun AssistantViewModel.newestPages(
    id: String,
    knownCount: Int?,
): Outcome<List<ConversationMessages>> =
    newestPage(id, knownCount).then { last ->
        if (last.page <= 1 || last.messages.size >= MESSAGE_PAGE_SIZE / 2) {
            Outcome.Success(listOf(last))
        } else {
            repositories.assistant.messages(id, last.page - 1).then { before -> Outcome.Success(listOf(before, last)) }
        }
    }

private suspend fun AssistantViewModel.newestPage(
    id: String,
    knownCount: Int?,
): Outcome<ConversationMessages> {
    val assistant = repositories.assistant
    if (knownCount != null) return assistant.messages(id, maxOf(1, (knownCount + MESSAGE_PAGE_SIZE - 1) / MESSAGE_PAGE_SIZE))
    return assistant.messages(id, 1).then { first -> if (first.pages <= 1) Outcome.Success(first) else assistant.messages(id, first.pages) }
}

private inline fun <T, R> Outcome<T>.then(next: (T) -> Outcome<R>): Outcome<R> =
    when (this) {
        is Outcome.Success -> next(value)
        is Outcome.Failure -> this
    }

fun AssistantViewModel.loadEarlier() {
    val content = content?.takeUnless { it.loadingEarlier } ?: return
    val page = content.earlierPage
    val id = content.conversation?.id
    if (page == null || id == null) return
    update { it.copy(loadingEarlier = true) }
    val generation = readGeneration
    viewModelScope.launch {
        val older = repositories.assistant.messages(id, page)
        if (generation != readGeneration) return@launch
        update {
            when (older) {
                is Outcome.Success -> {
                    it.copy(
                        loadingEarlier = false,
                        entries = older.value.messages.mapNotNull(::entryOf) + it.entries,
                        earlierPage = if (page > 1) page - 1 else null,
                    )
                }

                // The button stays, so the user can try again.
                is Outcome.Failure -> {
                    it.copy(loadingEarlier = false)
                }
            }
        }
    }
}

/** The conversation was renamed in the history sheet. */
fun AssistantViewModel.renamed(
    id: String,
    title: String,
) {
    update { if (it.conversation?.id == id) it.copy(conversation = it.conversation.copy(title = title)) else it }
}

/** The conversation was deleted in the history sheet; the open one goes with it. */
fun AssistantViewModel.deleted(id: String) {
    val state = uiState.value
    if (conversationId == id || (state is AssistantUiState.Failed && state.conversationId == id)) startNewChat()
}

internal fun AssistantViewModel.failedToOpen(): AppError? = (uiState.value as? AssistantUiState.Failed)?.error

/** Replies read from history are shown whole; their drafts were never stored, so none come back. */
private fun entryOf(message: ConversationMessage): ChatEntry? =
    when (message.role) {
        MessageRole.User -> {
            ChatEntry.User(message.id, message.content)
        }

        MessageRole.Assistant -> {
            ChatEntry.Michael(
                message.id,
                MichaelReply(
                    lines = ReplyFormat.parse(message.content),
                    toolActivity = message.toolActivity,
                    usedSavedData = message.toolActivity.any { it.status == ToolStatus.Completed },
                    drafts = emptyList(),
                    hasPlanningProposal = false,
                ),
            )
        }

        MessageRole.Unknown -> {
            null
        }
    }
