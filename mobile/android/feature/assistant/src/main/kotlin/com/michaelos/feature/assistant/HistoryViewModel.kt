package com.michaelos.feature.assistant

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.michaelos.core.data.AssistantRepository
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Conversation
import com.michaelos.core.model.ConversationFilter
import com.michaelos.core.model.ConversationPage
import com.michaelos.core.model.ConversationUpdate
import com.michaelos.core.model.Outcome
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface HistoryUiState {
    data object Loading : HistoryUiState

    data class Content(
        val conversations: List<Conversation>,
        val nextPage: Int?,
        val loadingMore: Boolean = false,
        /** Conversations with a change in flight; their rows are disabled. */
        val pending: Set<String> = emptySet(),
        /** Why the last change was refused, above the list. */
        val error: Reason? = null,
    ) : HistoryUiState

    data object Empty : HistoryUiState

    data class Failed(
        val error: AppError,
    ) : HistoryUiState
}

/**
 * The conversation history sheet. Rename, archive and delete wait for the server: it names the conversation and owns
 * whether the change is allowed.
 */
@HiltViewModel
class HistoryViewModel
    @Inject
    constructor(
        private val assistant: AssistantRepository,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<HistoryUiState>(HistoryUiState.Loading)
        val uiState: StateFlow<HistoryUiState> = mutableState.asStateFlow()
        private val mutableFilter = MutableStateFlow(ConversationFilter.Active)
        val filter: StateFlow<ConversationFilter> = mutableFilter.asStateFlow()
        private var read: Job? = null

        fun load() {
            read?.cancel()
            mutableState.value = HistoryUiState.Loading
            read =
                viewModelScope.launch {
                    mutableState.value =
                        when (val page = assistant.conversations(filter.value, 1)) {
                            is Outcome.Success -> {
                                if (page.value.conversations.isEmpty()) {
                                    HistoryUiState.Empty
                                } else {
                                    HistoryUiState.Content(page.value.conversations, nextOf(page.value))
                                }
                            }

                            is Outcome.Failure -> {
                                HistoryUiState.Failed(page.error)
                            }
                        }
                }
        }

        fun show(filter: ConversationFilter) {
            if (filter == mutableFilter.value) return
            mutableFilter.value = filter
            load()
        }

        fun loadMore() {
            val content = mutableState.value as? HistoryUiState.Content ?: return
            val page = content.nextPage ?: return
            if (content.loadingMore || read?.isActive == true) return
            mutableState.value = content.copy(loadingMore = true)
            read =
                viewModelScope.launch {
                    val more = assistant.conversations(filter.value, page)
                    edit { latest ->
                        when (more) {
                            is Outcome.Success -> {
                                val known = latest.conversations.map { it.id }.toSet()
                                latest.copy(
                                    conversations = latest.conversations + more.value.conversations.filter { it.id !in known },
                                    nextPage = nextOf(more.value),
                                    loadingMore = false,
                                )
                            }

                            // Scrolling to the end again asks again.
                            is Outcome.Failure -> {
                                latest.copy(loadingMore = false)
                            }
                        }
                    }
                }
        }

        /** [onRenamed] gets the conversation as the server saved it. */
        fun rename(
            id: String,
            title: String,
            onRenamed: (Conversation) -> Unit,
        ) {
            val trimmed = title.trim().take(TITLE_LIMIT)
            if (trimmed.isEmpty()) return
            change(id, { assistant.updateConversation(id, ConversationUpdate.Rename(trimmed)) }) { renamed ->
                edit { content -> content.copy(conversations = content.conversations.map { if (it.id == id) renamed else it }) }
                onRenamed(renamed)
            }
        }

        /** Archiving moves a conversation out of the list shown; unarchiving brings it back to the active one. */
        fun setArchived(
            id: String,
            archived: Boolean,
        ) {
            change(id, { assistant.updateConversation(id, ConversationUpdate.Archive(archived)) }) { remove(id) }
        }

        fun delete(
            id: String,
            onDeleted: () -> Unit,
        ) {
            change(id, { assistant.deleteConversation(id) }) {
                remove(id)
                onDeleted()
            }
        }

        private fun <T> change(
            id: String,
            call: suspend () -> Outcome<T>,
            onDone: (T) -> Unit,
        ) {
            val content = mutableState.value as? HistoryUiState.Content ?: return
            if (id in content.pending) return
            edit { it.copy(pending = it.pending + id, error = null) }
            viewModelScope.launch {
                when (val outcome = call()) {
                    is Outcome.Success -> {
                        edit { it.copy(pending = it.pending - id) }
                        onDone(outcome.value)
                    }

                    is Outcome.Failure -> {
                        edit { it.copy(pending = it.pending - id, error = refusal(outcome.error)) }
                    }
                }
            }
        }

        private fun remove(id: String) {
            edit { it.copy(conversations = it.conversations.filter { conversation -> conversation.id != id }) }
            val content = mutableState.value as? HistoryUiState.Content ?: return
            if (content.conversations.isEmpty() && content.nextPage == null) mutableState.value = HistoryUiState.Empty
        }

        private fun edit(change: (HistoryUiState.Content) -> HistoryUiState.Content) {
            mutableState.update { if (it is HistoryUiState.Content) change(it) else it }
        }

        private companion object {
            const val TITLE_LIMIT = 120

            fun nextOf(page: ConversationPage) = if (page.page < page.pages) page.page + 1 else null

            fun refusal(error: AppError): Reason =
                when (error) {
                    AppError.Offline -> Reason.Local(R.string.history_error_offline)
                    is AppError.NotFound -> error.server.text?.let(Reason::Server) ?: Reason.Local(R.string.history_error_generic)
                    is AppError.Conflict -> error.server.text?.let(Reason::Server) ?: Reason.Local(R.string.history_error_generic)
                    is AppError.Validation -> error.server.text?.let(Reason::Server) ?: Reason.Local(R.string.history_error_generic)
                    else -> Reason.Local(R.string.history_error_generic)
                }
        }
    }
