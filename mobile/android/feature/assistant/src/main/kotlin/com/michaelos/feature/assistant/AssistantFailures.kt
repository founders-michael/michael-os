package com.michaelos.feature.assistant

import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

fun AssistantViewModel.retry() {
    val failure = content?.failure ?: return
    val action = failure.action
    if (action is ChatFailure.Action.RetryAfter && action.at.isAfter(clock.instant())) return
    val id = conversationId
    if (action != ChatFailure.Action.ReloadThenRetry || id == null) return send(failure.message)
    viewModelScope.launch {
        openNow(id, knownCount = null)
        if (!replied(failure.message)) send(failure.message)
    }
}

/** The conversation ends with this message and a reply to it, as the server saves a completed exchange. */
internal fun AssistantViewModel.replied(message: String): Boolean {
    val entries = content?.entries.orEmpty()
    return entries.size >= 2 && entries.last() is ChatEntry.Michael && (entries[entries.size - 2] as? ChatEntry.User)?.text == message
}

/** The failed message goes back to the composer to be changed. */
fun AssistantViewModel.editFailed() {
    val failure = content?.failure ?: return
    type(failure.message)
    update { it.copy(failure = null) }
}

fun AssistantViewModel.acknowledgeDataUse() {
    val message = content?.acknowledgement ?: return
    dataUseAcknowledged = true
    update { it.copy(acknowledgement = null) }
    send(message)
}

fun AssistantViewModel.declineDataUse() {
    val message = content?.acknowledgement ?: return
    type(message)
    update { it.copy(acknowledgement = null) }
}
