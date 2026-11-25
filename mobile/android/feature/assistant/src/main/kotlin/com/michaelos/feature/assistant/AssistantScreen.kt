package com.michaelos.feature.assistant

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.michaelos.core.designsystem.component.FailureStateView
import com.michaelos.core.designsystem.component.MichaelBackground
import com.michaelos.core.designsystem.component.MichaelIcons
import com.michaelos.core.designsystem.component.MichaelOrb
import com.michaelos.core.designsystem.component.MichaelOrbActivity
import com.michaelos.core.designsystem.component.MichaelOrbSize
import com.michaelos.core.designsystem.component.SkeletonBlock
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.AppError

/** A question handed over from another screen. Each handover is new, even when the text repeats. */
data class AssistantPrompt(
    val id: String,
    val text: String,
)

@Composable
fun AssistantScreen(
    prompt: AssistantPrompt?,
    onOpen: (Destination) -> Unit,
    onFinishSetup: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: AssistantViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val presence by viewModel.presence.collectAsStateWithLifecycle()
    val composer by viewModel.composer.collectAsStateWithLifecycle()
    var showingHistory by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(prompt) { prompt?.let { viewModel.prefill(it.id, it.text) } }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { viewModel.enterBackground() }
    LifecycleEventEffect(Lifecycle.Event.ON_START) { viewModel.enterForeground() }
    val content = (state as? AssistantUiState.Chat)?.content
    MichaelBackground(modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().imePadding()) {
            ChatHeader(
                title = content?.conversation?.title ?: stringResource(R.string.chat_new_conversation),
                presence = presence,
                progress = content?.turn?.progress?.line,
                canStartNew = content?.turn == null,
                onHistory = { showingHistory = true },
                onNewChat = viewModel::startNewChat,
            )
            Box(Modifier.weight(1f)) {
                when (val current = state) {
                    AssistantUiState.Opening -> {
                        ChatSkeleton()
                    }

                    is AssistantUiState.Failed -> {
                        FailureStateView(
                            stringResource(openMessage(current.error)),
                            onRetry = { viewModel.open(current.conversationId, knownCount = null) },
                            modifier = Modifier.align(Alignment.Center),
                        )
                    }

                    is AssistantUiState.Chat -> {
                        if (current.content.isEmpty) {
                            ChatEmptyView(viewModel.canSendSuggestion, viewModel::send)
                        } else {
                            ChatTranscript(
                                content = current.content,
                                viewModel = viewModel,
                                failureActions =
                                    FailureActions(
                                        retry = viewModel::retry,
                                        edit = viewModel::editFailed,
                                        newChat = viewModel::startNewChat,
                                        finishSetup = onFinishSetup,
                                        openHistory = { showingHistory = true },
                                    ),
                                onOpen = onOpen,
                            )
                        }
                    }
                }
            }
            ComposerBar(
                text = composer,
                count = viewModel.composerCount,
                busy = content?.turn != null,
                canSend = viewModel.canSend,
                onType = viewModel::type,
                onFocus = viewModel::focusComposer,
                onSend = viewModel::sendComposer,
            )
        }
    }
    if (showingHistory) {
        HistorySheet(
            current = viewModel.conversationId,
            onDismiss = { showingHistory = false },
            onOpen = { conversation ->
                showingHistory = false
                viewModel.open(conversation.id, conversation.messageCount)
            },
            onNewChat = {
                showingHistory = false
                viewModel.startNewChat()
            },
            onRenamed = { viewModel.renamed(it.id, it.title) },
            onDeleted = viewModel::deleted,
        )
    }
}

private fun openMessage(error: AppError): Int =
    when (error) {
        AppError.Offline -> R.string.chat_open_offline
        is AppError.NotFound -> R.string.chat_conversation_gone
        else -> R.string.chat_open_failed
    }

@Composable
private fun ChatHeader(
    title: String,
    presence: PresenceState,
    progress: ProgressLine?,
    canStartNew: Boolean,
    onHistory: () -> Unit,
    onNewChat: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val status =
        progress?.let { progressText(it) }
            ?: if (presence == PresenceState.Idle) stringResource(R.string.chat_michael) else presenceLabel(presence)
    val statusColor =
        when {
            presence == PresenceState.Error -> colors.danger
            progress != null || presence != PresenceState.Idle -> colors.atext
            else -> colors.muted
        }
    Column(Modifier.background(colors.solid)) {
        Row(
            Modifier.fillMaxWidth().padding(
                start = MichaelSpace.lg,
                end = MichaelSpace.sm,
                top = MichaelSpace.sm,
                bottom = MichaelSpace.sm,
            ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MichaelSpace.md),
        ) {
            MichaelOrb(MichaelOrbSize.Small, activity = if (presence.isWorking) MichaelOrbActivity.Thinking else MichaelOrbActivity.Idle)
            Column(Modifier.weight(1f)) {
                MichaelText(title, MichaelTextStyle.Label, colors.text, modifier = Modifier.semantics { heading() }, maxLines = 1)
                MichaelText(
                    status,
                    MichaelTextStyle.Caption,
                    statusColor,
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    maxLines = 2,
                )
            }
            IconButton(MichaelIcons.history, stringResource(R.string.chat_history), enabled = true, onClick = onHistory)
            IconButton(MichaelIcons.compose, stringResource(R.string.chat_new_chat), enabled = canStartNew, onClick = onNewChat)
        }
        Spacer(Modifier.fillMaxWidth().height(1.dp).background(colors.border))
    }
}

@Composable
internal fun presenceLabel(state: PresenceState): String =
    stringResource(
        when (state) {
            PresenceState.Idle -> R.string.presence_idle
            PresenceState.Listening -> R.string.presence_listening
            PresenceState.Thinking -> R.string.presence_thinking
            PresenceState.Executing -> R.string.presence_executing
            PresenceState.Responding -> R.string.presence_responding
            PresenceState.AwaitingApproval -> R.string.presence_awaiting_approval
            PresenceState.Error -> R.string.presence_error
        },
    )

@Composable
private fun IconButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val colors = MichaelTheme.colors
    Box(
        Modifier
            .size(MichaelSize.checkTouch)
            .clickable(enabled = enabled, role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Image(icon, null, Modifier.size(MichaelSize.check), colorFilter = ColorFilter.tint(if (enabled) colors.muted else colors.faint))
    }
}

@Composable
private fun ChatEmptyView(
    canSend: Boolean,
    onSuggestion: (String) -> Unit,
) {
    val colors = MichaelTheme.colors
    val suggestions =
        listOf(
            R.string.chat_suggestion_focus,
            R.string.chat_suggestion_overdue,
            R.string.chat_suggestion_week,
            R.string.chat_suggestion_reorganize,
        ).map { stringResource(it) }
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(
                rememberScrollState(),
            ).padding(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.xl),
    ) {
        Box(
            Modifier.size(MichaelSize.orbLarge * RING).border(1.dp, colors.chipBorder, RoundedCornerShape(MichaelRadius.pill)),
            contentAlignment = Alignment.Center,
        ) { MichaelOrb(MichaelOrbSize.Large) }
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            MichaelText(
                stringResource(R.string.chat_empty_title),
                MichaelTextStyle.Title,
                colors.text,
                modifier = Modifier.semantics { heading() },
                textAlign = TextAlign.Center,
            )
            MichaelText(stringResource(R.string.chat_empty_body), MichaelTextStyle.Body, colors.muted, textAlign = TextAlign.Center)
        }
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            suggestions.forEach { suggestion ->
                val shape = RoundedCornerShape(MichaelRadius.stat)
                MichaelText(
                    suggestion,
                    MichaelTextStyle.Body,
                    if (canSend) colors.text else colors.faint,
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .background(colors.surface, shape)
                            .border(1.dp, colors.border2, shape)
                            .clickable(enabled = canSend, role = Role.Button) { onSuggestion(suggestion) }
                            .padding(horizontal = MichaelSpace.lg, vertical = MichaelSpace.md),
                )
            }
        }
    }
}

@Composable
private fun ChatSkeleton() {
    val label = stringResource(R.string.chat_opening)
    Column(
        Modifier.fillMaxSize().padding(MichaelSpace.screenGutter).semantics(mergeDescendants = true) { contentDescription = label },
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg),
    ) {
        Row {
            Spacer(Modifier.weight(1f))
            SkeletonBlock(height = MichaelSize.button, modifier = Modifier.weight(SKELETON_BUBBLE), cornerRadius = MichaelRadius.stat)
        }
        SkeletonBlock(height = MichaelSpace.lg, modifier = Modifier.fillMaxWidth())
        SkeletonBlock(height = MichaelSpace.lg, modifier = Modifier.fillMaxWidth())
        SkeletonBlock(height = MichaelSpace.lg, modifier = Modifier.fillMaxWidth().padding(end = MichaelSpace.xxl))
    }
}

@Composable
private fun ComposerBar(
    text: String,
    count: Int,
    busy: Boolean,
    canSend: Boolean,
    onType: (String) -> Unit,
    onFocus: (Boolean) -> Unit,
    onSend: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val shape = RoundedCornerShape(MichaelRadius.stat)
    val label = stringResource(R.string.chat_composer_label)
    Column(Modifier.background(colors.solid)) {
        Spacer(Modifier.fillMaxWidth().height(1.dp).background(colors.border))
        Column(Modifier.padding(horizontal = MichaelSpace.md, vertical = MichaelSpace.sm), horizontalAlignment = Alignment.End) {
            if (count >= AssistantViewModel.COUNT_FROM) {
                MichaelText(
                    stringResource(R.string.chat_count, count, AssistantViewModel.MESSAGE_LIMIT),
                    MichaelTextStyle.Caption,
                    if (count > AssistantViewModel.MESSAGE_LIMIT) colors.danger else colors.muted,
                )
            }
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(
                        colors.surface,
                        shape,
                    ).border(1.dp, colors.border2, shape)
                    .padding(start = MichaelSpace.md),
                verticalAlignment = Alignment.Bottom,
            ) {
                BasicTextField(
                    value = text,
                    onValueChange = onType,
                    maxLines = COMPOSER_LINES,
                    textStyle = MichaelTextStyle.Body.textStyle.copy(color = colors.text),
                    cursorBrush = SolidColor(colors.accent),
                    modifier =
                        Modifier
                            .weight(1f)
                            .padding(vertical = MichaelSpace.md)
                            .onFocusChanged { onFocus(it.isFocused) }
                            .semantics { contentDescription = label },
                    decorationBox = { field ->
                        if (text.isEmpty()) {
                            MichaelText(
                                stringResource(if (busy) R.string.chat_composer_working else R.string.chat_composer),
                                MichaelTextStyle.Body,
                                colors.faint,
                                maxLines = 1,
                            )
                        }
                        field()
                    },
                )
                val sendLabel = stringResource(R.string.chat_send)
                Box(
                    Modifier
                        .size(MichaelSize.checkTouch)
                        .clickable(enabled = canSend, role = Role.Button, onClickLabel = sendLabel, onClick = onSend)
                        .semantics { contentDescription = sendLabel },
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        Modifier
                            .size(MichaelSize.buttonSmall)
                            .background(if (canSend) colors.fill else colors.raise, RoundedCornerShape(MichaelRadius.buttonSmall)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Image(
                            MichaelIcons.send,
                            null,
                            Modifier.size(MichaelSpace.lg + MichaelSpace.xs),
                            colorFilter = ColorFilter.tint(if (canSend) colors.onfill else colors.faint),
                        )
                    }
                }
            }
        }
    }
}

private const val RING = 1.25f
private const val SKELETON_BUBBLE = 3f
private const val COMPOSER_LINES = 5
