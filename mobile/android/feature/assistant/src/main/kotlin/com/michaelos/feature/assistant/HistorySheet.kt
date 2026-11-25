package com.michaelos.feature.assistant

import android.text.format.DateUtils
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.michaelos.core.designsystem.component.EmptyStateView
import com.michaelos.core.designsystem.component.FailureStateView
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelTextField
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Conversation
import com.michaelos.core.model.ConversationFilter

/** Saved conversations, newest first. Press and hold a row to rename, archive or delete it. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HistorySheet(
    current: String?,
    onDismiss: () -> Unit,
    onOpen: (Conversation) -> Unit,
    onNewChat: () -> Unit,
    onRenamed: (Conversation) -> Unit,
    onDeleted: (String) -> Unit,
    viewModel: HistoryViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val filter by viewModel.filter.collectAsStateWithLifecycle()
    var renaming by remember { mutableStateOf<Conversation?>(null) }
    var deleting by remember { mutableStateOf<Conversation?>(null) }
    LaunchedEffect(Unit) { viewModel.load() }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MichaelTheme.colors.solid,
    ) {
        Column(Modifier.fillMaxWidth().fillMaxHeight(SHEET_HEIGHT).padding(horizontal = MichaelSpace.screenGutter)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                MichaelText(
                    stringResource(R.string.history_title),
                    MichaelTextStyle.Heading,
                    MichaelTheme.colors.text,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                TextButton(
                    onClick = onNewChat,
                ) { MichaelText(stringResource(R.string.chat_new_chat), MichaelTextStyle.Button, MichaelTheme.colors.atext) }
            }
            Box(Modifier.weight(1f)) {
                when (val shown = state) {
                    HistoryUiState.Loading -> {
                        val loading = stringResource(R.string.history_loading)
                        CircularProgressIndicator(
                            Modifier.align(Alignment.Center).semantics { contentDescription = loading },
                            color = MichaelTheme.colors.accent,
                        )
                    }

                    HistoryUiState.Empty -> {
                        EmptyStateView(
                            stringResource(
                                if (filter ==
                                    ConversationFilter.Active
                                ) {
                                    R.string.history_empty_title
                                } else {
                                    R.string.history_empty_archived_title
                                },
                            ),
                            stringResource(R.string.history_empty_body),
                            stringResource(R.string.chat_new_chat),
                            onNewChat,
                            Modifier.align(Alignment.Center),
                        )
                    }

                    is HistoryUiState.Failed -> {
                        FailureStateView(
                            stringResource(
                                if (shown.error ==
                                    AppError.Offline
                                ) {
                                    R.string.history_error_offline
                                } else {
                                    R.string.history_error_load
                                },
                            ),
                            viewModel::load,
                            Modifier.align(Alignment.Center),
                        )
                    }

                    is HistoryUiState.Content -> {
                        HistoryList(
                            content = shown,
                            current = current,
                            filter = filter,
                            onOpen = onOpen,
                            onRename = { renaming = it },
                            onArchive = { viewModel.setArchived(it.id, filter == ConversationFilter.Active) },
                            onDelete = { deleting = it },
                            onEnd = viewModel::loadMore,
                        )
                    }
                }
            }
            MichaelButton(
                stringResource(if (filter == ConversationFilter.Active) R.string.history_show_archived else R.string.history_show_active),
                { viewModel.show(if (filter == ConversationFilter.Active) ConversationFilter.Archived else ConversationFilter.Active) },
                style = MichaelButtonStyle.Ghost,
            )
            Spacer(Modifier.height(MichaelSpace.lg))
        }
    }
    renaming?.let { conversation ->
        RenameDialog(conversation, onDismiss = { renaming = null }) { title ->
            renaming = null
            viewModel.rename(conversation.id, title, onRenamed)
        }
    }
    deleting?.let { conversation ->
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text(stringResource(R.string.history_delete_title, conversation.title)) },
            text = { Text(stringResource(R.string.history_delete_message)) },
            confirmButton = {
                TextButton(onClick = {
                    deleting = null
                    viewModel.delete(conversation.id) { onDeleted(conversation.id) }
                }) { Text(stringResource(R.string.history_delete_confirm), color = MichaelTheme.colors.danger) }
            },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text(stringResource(R.string.history_cancel)) } },
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun HistoryList(
    content: HistoryUiState.Content,
    current: String?,
    filter: ConversationFilter,
    onOpen: (Conversation) -> Unit,
    onRename: (Conversation) -> Unit,
    onArchive: (Conversation) -> Unit,
    onDelete: (Conversation) -> Unit,
    onEnd: () -> Unit,
) {
    val colors = MichaelTheme.colors
    LazyColumn(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
        content.error?.let { error -> item(key = "error") { MichaelText(reasonText(error), MichaelTextStyle.Label, colors.danger) } }
        items(content.conversations, key = { it.id }) { conversation ->
            var menu by remember { mutableStateOf(false) }
            val pending = conversation.id in content.pending
            Box {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .defaultMinSize(minHeight = MichaelSize.button)
                        .combinedClickable(
                            enabled = !pending,
                            onLongClickLabel = stringResource(R.string.history_rename),
                            onLongClick = { menu = true },
                        ) { onOpen(conversation) }
                        .padding(vertical = MichaelSpace.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
                        MichaelText(conversation.title, MichaelTextStyle.Body, if (pending) colors.faint else colors.text, maxLines = 2)
                        MichaelText(detail(conversation), MichaelTextStyle.Caption, colors.muted)
                    }
                    if (conversation.id ==
                        current
                    ) {
                        MichaelText(stringResource(R.string.history_current), MichaelTextStyle.Caption, colors.atext)
                    }
                }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    MenuItem(R.string.history_rename) {
                        menu = false
                        onRename(conversation)
                    }
                    MenuItem(if (filter == ConversationFilter.Active) R.string.history_archive else R.string.history_unarchive) {
                        menu = false
                        onArchive(conversation)
                    }
                    MenuItem(R.string.history_delete) {
                        menu = false
                        onDelete(conversation)
                    }
                }
            }
        }
        if (content.nextPage != null) {
            item(key = "more") {
                LaunchedEffect(content.conversations.size) { onEnd() }
                Box(Modifier.fillMaxWidth().padding(MichaelSpace.md), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = colors.accent)
                }
            }
        }
    }
}

@Composable
private fun MenuItem(
    text: Int,
    onClick: () -> Unit,
) {
    DropdownMenuItem(text = { MichaelText(stringResource(text), MichaelTextStyle.Body, MichaelTheme.colors.text) }, onClick = onClick)
}

@Composable
private fun RenameDialog(
    conversation: Conversation,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    var title by remember { mutableStateOf(conversation.title) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.history_rename_title)) },
        text = { MichaelTextField(stringResource(R.string.history_rename_field), title, { title = it }) },
        confirmButton = {
            TextButton(onClick = { onSave(title) }, enabled = title.isNotBlank()) { Text(stringResource(R.string.history_rename_save)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.history_cancel)) } },
    )
}

@Composable
private fun detail(conversation: Conversation): String {
    val instant = conversation.lastMessageAt ?: conversation.createdAt
    val ago = DateUtils.getRelativeTimeSpanString(instant.toEpochMilli()).toString()
    val messages = pluralStringResource(R.plurals.history_messages, conversation.messageCount, conversation.messageCount)
    return stringResource(R.string.history_detail, ago, messages)
}

private const val SHEET_HEIGHT = 0.9f
