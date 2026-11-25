package com.michaelos.feature.assistant

import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** A reply in flight is closed if the app stays in the background past a short grace period. */
fun AssistantViewModel.enterBackground() {
    if (!isBusy) return
    graceJob?.cancel()
    graceJob =
        viewModelScope.launch {
            delay(backgroundGrace)
            if (isBusy) {
                cutByBackground = true
                turnJob?.cancel()
            }
        }
}

/** The server saves only completed exchanges, so a closed reply is read back from it, never resumed. */
fun AssistantViewModel.enterForeground() {
    graceJob?.cancel()
    val message = content?.turn?.message
    if (!cutByBackground || message == null) return
    cutByBackground = false
    val id = conversationId
    if (id == null) {
        finishTurn(ChatFailure.backgrounded(message))
        return
    }
    update { it.copy(turn = null) }
    viewModelScope.launch {
        openNow(id, knownCount = null)
        if (content != null && !replied(message)) update { it.copy(failure = ChatFailure.backgrounded(message)) }
    }
}
