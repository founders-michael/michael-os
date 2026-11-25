package com.michaelos.feature.assistant

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonSize
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.theme.MichaelSpace

@Composable
internal fun ChatTranscript(
    content: ChatContent,
    viewModel: AssistantViewModel,
    failureActions: FailureActions,
    onOpen: (Destination) -> Unit,
) {
    val list = rememberLazyListState()
    // Back to the newest message, even if the user had scrolled up to reread, unless loading older ones.
    LaunchedEffect(content.entries.size, content.turn?.message, content.failure, content.acknowledgement) {
        val total = list.layoutInfo.totalItemsCount
        if (!content.loadingEarlier && total > 0) list.animateScrollToItem(total - 1)
    }
    LazyColumn(
        state = list,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.lg),
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg),
    ) {
        if (content.earlierPage != null) {
            item(key = "earlier") {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    MichaelButton(
                        stringResource(R.string.chat_earlier),
                        viewModel::loadEarlier,
                        style = MichaelButtonStyle.Ghost,
                        size = MichaelButtonSize.Small,
                        enabled = !content.loadingEarlier,
                    )
                }
            }
        }
        items(content.entries, key = { it.id }) { entry ->
            when (entry) {
                is ChatEntry.User -> {
                    UserBubble(entry.text)
                }

                is ChatEntry.Michael -> {
                    MichaelReplyView(
                        reply = entry.reply,
                        revealing = content.revealing == entry.id,
                        onRevealed = { viewModel.finishReveal(entry.id) },
                        draftActions = { id ->
                            DraftCardActions(
                                edit = { field, value -> viewModel.edit(id, field, value) },
                                save = { viewModel.save(id) },
                                discard = { viewModel.discard(id) },
                                open = onOpen,
                            )
                        },
                        onOpenCalendar = { onOpen(Destination.Calendar) },
                    )
                }
            }
        }
        content.turn?.let { turn -> item(key = "turn") { TurnView(turn) } }
        content.failure?.let { failure -> item(key = "failure") { FailureRow(failure, failureActions, viewModel.clock) } }
        content.acknowledgement?.let { message ->
            item(key = "acknowledgement") { DataUseNotice(message, viewModel::acknowledgeDataUse, viewModel::declineDataUse) }
        }
        item(key = "end") { Box(Modifier.fillMaxWidth()) }
    }
}
