package com.michaelos.feature.assistant

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.michaelos.core.data.AssistantRepository
import com.michaelos.core.model.AppError
import com.michaelos.core.model.ChatEvent
import com.michaelos.core.model.ChatReply
import com.michaelos.core.model.ChatRequest
import com.michaelos.core.model.ChatStreamError
import com.michaelos.core.model.Conversation
import com.michaelos.core.model.Outcome
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Clock
import java.util.UUID
import javax.inject.Inject
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

sealed interface AssistantUiState {
    /** A stored conversation is being read. */
    data object Opening : AssistantUiState

    data class Chat(
        val content: ChatContent,
    ) : AssistantUiState

    /** The conversation could not be read and nothing is shown. */
    data class Failed(
        val error: AppError,
        val conversationId: String,
    ) : AssistantUiState
}

@HiltViewModel
class AssistantViewModel
    @Inject
    constructor(
        internal val repositories: AssistantRepositories,
        internal val clock: Clock,
        private val savedState: SavedStateHandle,
    ) : ViewModel() {
        internal val mutableState = MutableStateFlow<AssistantUiState>(AssistantUiState.Chat(ChatContent()))
        val uiState: StateFlow<AssistantUiState> = mutableState.asStateFlow()

        /** What the user is typing. It survives process death, as does the open conversation. */
        val composer: StateFlow<String> = savedState.getStateFlow(COMPOSER, "")
        private val composerFocused = MutableStateFlow(false)

        val presence: StateFlow<PresenceState> =
            combine(mutableState, composer, composerFocused) { state, text, focused -> presenceOf(state, text, focused) }
                .stateIn(viewModelScope, SharingStarted.Eagerly, PresenceState.Idle)

        /** Asked once per signed-in session, when the server says the AI provider's data terms need it. */
        internal var dataUseAcknowledged = false
        internal var backgroundGrace: Duration = 10.seconds
        internal var turnJob: Job? = null
        internal var graceJob: Job? = null
        internal var cutByBackground = false
        private var handledPrompt: String?
            get() = savedState[HANDLED_PROMPT]
            set(value) {
                savedState[HANDLED_PROMPT] = value
            }
        internal var readGeneration = 0

        init {
            savedState.get<String>(CONVERSATION)?.let { open(it, knownCount = null) }
        }

        internal val content: ChatContent? get() = (mutableState.value as? AssistantUiState.Chat)?.content

        val conversationId: String? get() = content?.conversation?.id

        internal val isBusy: Boolean get() = content?.turn != null

        /** The server counts UTF-16 units, as Kotlin strings do. */
        val composerCount: Int get() = composer.value.trim().length

        val canSend: Boolean
            get() {
                val content = content ?: return false
                return content.turn == null && content.acknowledgement == null && composerCount in 1..MESSAGE_LIMIT
            }

        /** A suggested prompt can be sent whenever nothing is in flight or waiting for the user. */
        val canSendSuggestion: Boolean get() = content?.let { it.turn == null && it.acknowledgement == null } ?: false

        fun type(text: String) {
            savedState[COMPOSER] = text
        }

        fun focusComposer(focused: Boolean) {
            composerFocused.value = focused
        }

        internal fun update(change: (ChatContent) -> ChatContent) {
            mutableState.update { state -> if (state is AssistantUiState.Chat) AssistantUiState.Chat(change(state.content)) else state }
            if (mutableState.value is AssistantUiState.Chat) savedState[CONVERSATION] = conversationId
        }

        fun sendComposer() {
            if (!canSend) return
            val message = composer.value.trim()
            type("")
            send(message)
        }

        /** Sends a suggested prompt, or a failed message again. */
        fun send(message: String) {
            val content = content ?: return
            if (content.turn != null || message.isEmpty() || message.length > MESSAGE_LIMIT) return
            update { it.copy(failure = null, acknowledgement = null, turn = Turn(message, TurnProgress.SENDING)) }
            cutByBackground = false
            // The view model's scope, not the screen's: switching tabs must not cancel a message the user sent.
            turnJob = viewModelScope.launch { runTurn(message) }
        }

        private suspend fun runTurn(message: String) {
            val conversation =
                content?.conversation ?: when (val created = repositories.assistant.createConversation()) {
                    is Outcome.Success -> created.value.also { made -> update { it.copy(conversation = made) } }
                    is Outcome.Failure -> return refuse(created.error, message)
                }
            var reply: ChatReply? = null
            var streamError: ChatStreamError? = null
            val request = ChatRequest(message, conversation.id, dataUseAcknowledged)
            val outcome =
                repositories.assistant.send(request) { event ->
                    when (event) {
                        is ChatEvent.Message -> {
                            reply = event.reply
                        }

                        is ChatEvent.Error -> {
                            streamError = event.error
                        }

                        else -> {
                            update { content ->
                                content.copy(turn = content.turn?.let { it.copy(progress = it.progress.advancedBy(event)) })
                            }
                        }
                    }
                }
            if (outcome is Outcome.Failure) return refuse(outcome.error, message)
            val delivered = reply
            val failed = streamError
            when {
                failed != null -> finishTurn(ChatFailure.streamFailed(failed, message, clock.instant()))
                delivered != null -> deliver(delivered, message, conversation)
                else -> finishTurn(ChatFailure.interrupted(message))
            }
        }

        private fun refuse(
            error: AppError,
            message: String,
        ) {
            if (error is AppError.Validation && error.server.code == "DATA_USE_ACKNOWLEDGEMENT_REQUIRED") {
                update { it.copy(turn = null, acknowledgement = message) }
            } else {
                finishTurn(ChatFailure.refused(error, message, clock.instant()))
            }
        }

        internal fun finishTurn(failure: ChatFailure) {
            update { it.copy(turn = null, failure = failure) }
        }

        private fun deliver(
            reply: ChatReply,
            message: String,
            conversation: Conversation,
        ) {
            val replyId = UUID.randomUUID().toString()
            val entry =
                ChatEntry.Michael(
                    replyId,
                    MichaelReply(
                        lines = ReplyFormat.parse(reply.content),
                        toolActivity = reply.toolActivity,
                        usedSavedData = reply.usedSavedData,
                        drafts = reply.drafts.mapIndexed { index, draft -> DraftCard("$replyId-$index", DraftForm.of(draft)) },
                        planningProposal = reply.planningProposal,
                    ),
                )
            update {
                it.copy(
                    turn = null,
                    entries = it.entries + ChatEntry.User(UUID.randomUUID().toString(), message) + entry,
                    revealing = replyId,
                    conversation =
                        it.conversation?.copy(messageCount = it.conversation.messageCount + 2, lastMessageAt = clock.instant()),
                )
            }
            // The reveal is the screen's to pace, but it never outlasts its cap, so the orb cannot stay "responding"
            // if the reply scrolls away or the app goes to the background mid-reveal.
            viewModelScope.launch {
                delay(ReplyReveal.LIMIT)
                finishReveal(replyId)
            }
            // The server names a conversation after its first message.
            if (conversation.messageCount == 0) viewModelScope.launch { refreshTitle(conversation.id) }
        }

        private suspend fun refreshTitle(id: String) {
            val named = (repositories.assistant.messages(id, page = 1) as? Outcome.Success)?.value?.conversation ?: return
            if (conversationId == id) update { it.copy(conversation = it.conversation?.copy(title = named.title)) }
        }

        /** The reply has been revealed, or shown at once with animations off. */
        fun finishReveal(id: String) {
            update { if (it.revealing == id) it.copy(revealing = null) else it }
        }

        /** A question handed over from another screen goes in the composer, unsent. It starts a new chat unless a reply is in flight. */
        fun prefill(
            handoverId: String,
            prompt: String,
        ) {
            if (handoverId == handledPrompt) return
            handledPrompt = handoverId
            val fresh = content?.let { it.isEmpty && it.conversation == null } ?: false
            if (!isBusy && !fresh) startNewChat()
            type(prompt)
        }

        fun startNewChat() {
            if (isBusy) return
            readGeneration += 1
            mutableState.value = AssistantUiState.Chat(ChatContent())
            savedState[CONVERSATION] = null
        }

        internal companion object {
            const val MESSAGE_LIMIT = 4000

            /** How near the limit the count appears. */
            const val COUNT_FROM = 3600
            const val COMPOSER = "assistant.composer"
            const val CONVERSATION = "assistant.conversation"
            const val HANDLED_PROMPT = "assistant.handledPrompt"

            fun presenceOf(
                state: AssistantUiState,
                composer: String,
                focused: Boolean,
            ): PresenceState {
                val content = (state as? AssistantUiState.Chat)?.content
                return PresenceSignals(
                    turn = content?.turn?.progress,
                    revealing = content?.revealing != null,
                    failed = content?.failure != null,
                    pendingApprovals = content?.pendingDrafts ?: 0,
                    userComposing = focused && composer.isNotBlank(),
                ).state
            }
        }
    }
