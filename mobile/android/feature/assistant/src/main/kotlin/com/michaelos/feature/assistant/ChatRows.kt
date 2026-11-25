package com.michaelos.feature.assistant

import android.content.ClipData
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.michaelos.core.designsystem.component.AICard
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonSize
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelCard
import com.michaelos.core.designsystem.component.MichaelChip
import com.michaelos.core.designsystem.component.MichaelChipTone
import com.michaelos.core.designsystem.component.MichaelIcons
import com.michaelos.core.designsystem.component.TypingDots
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.ToolStatus
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Clock
import java.time.Instant

@Composable
internal fun UserBubble(text: String) {
    val colors = MichaelTheme.colors
    val radii = MichaelRadius.bubble
    val shape = RoundedCornerShape(topStart = radii[0], topEnd = radii[1], bottomEnd = radii[2], bottomStart = radii[3])
    val label = stringResource(R.string.chat_you, text)
    Box(Modifier.fillMaxWidth().padding(start = MichaelSpace.xxl), contentAlignment = Alignment.CenterEnd) {
        MichaelText(
            text,
            MichaelTextStyle.Body,
            colors.text,
            modifier =
                Modifier
                    .background(colors.raise, shape)
                    .border(1.dp, colors.border, shape)
                    .padding(horizontal = MichaelSpace.lg, vertical = MichaelSpace.md)
                    .semantics { contentDescription = label },
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun MichaelReplyView(
    reply: MichaelReply,
    revealing: Boolean,
    onRevealed: () -> Unit,
    draftActions: (String) -> DraftCardActions,
    onOpenCalendar: () -> Unit,
) {
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    var menu by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MichaelSpace.md)) {
        if (reply.toolActivity.isNotEmpty()) {
            ToolChips(reply.toolActivity.map { it.name to it.status })
        } else if (!reply.usedSavedData) {
            MichaelChip(stringResource(R.string.chat_no_saved_data))
        }
        Box {
            ReplyText(
                reply.lines,
                revealing,
                onRevealed,
                Modifier.combinedClickable(onLongClickLabel = stringResource(R.string.chat_copy), onLongClick = { menu = true }) {},
            )
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(
                    text = { MichaelText(stringResource(R.string.chat_copy), MichaelTextStyle.Body, MichaelTheme.colors.text) },
                    onClick = {
                        menu = false
                        scope.launch { clipboard.setClipEntry(ClipEntry(ClipData.newPlainText(null, reply.plainText))) }
                    },
                )
            }
        }
        if (reply.hasPlanningProposal) PlanPointer(onOpenCalendar)
        reply.drafts.forEach { card -> DraftCardView(card, draftActions(card.id)) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ToolChips(items: List<Pair<String, ToolStatus>>) {
    val labels = items.map { stringResource(ToolLabel.of(it.first).label) }
    val summary = stringResource(R.string.chat_sources, labels.joinToString(", "))
    FlowRow(
        modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = summary },
        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
    ) {
        items.forEachIndexed { index, (_, status) ->
            val completed = status == ToolStatus.Completed
            MichaelChip(
                if (completed) labels[index] else stringResource(R.string.chat_tool_unavailable, labels[index]),
                tone = if (completed) MichaelChipTone.Ai else MichaelChipTone.Plain,
            )
        }
    }
}

@Composable
private fun PlanPointer(onOpenCalendar: () -> Unit) {
    val colors = MichaelTheme.colors
    AICard {
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            MichaelText(stringResource(R.string.chat_plan_title), MichaelTextStyle.Eyebrow, colors.atext)
            MichaelText(stringResource(R.string.chat_plan_body), MichaelTextStyle.Label, colors.text)
            MichaelButton(
                stringResource(R.string.chat_plan_open),
                onOpenCalendar,
                style = MichaelButtonStyle.Secondary,
                size = MichaelButtonSize.Small,
            )
        }
    }
}

/** The message just sent and what Michael is doing about it. Every line is a stream event that happened. */
@Composable
internal fun TurnView(turn: Turn) {
    val colors = MichaelTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.md)) {
        UserBubble(turn.message)
        Column(Modifier.semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            turn.progress.tools
                .filter { it.finished != null }
                .forEach { Step(stringResource(ToolLabel.of(it.name).label), done = true) }
            Step(progressText(turn.progress.line), done = false)
        }
        MichaelText(stringResource(R.string.chat_working_note), MichaelTextStyle.Caption, colors.faint)
    }
}

@Composable
internal fun progressText(line: ProgressLine): String =
    when (line) {
        ProgressLine.Sending -> stringResource(R.string.presence_progress_sending)
        ProgressLine.Thinking -> stringResource(R.string.presence_progress_thinking)
        ProgressLine.Composing -> stringResource(R.string.presence_progress_composing)
        is ProgressLine.Running -> stringResource(ToolLabel.of(line.tool).doing)
    }

@Composable
private fun Step(
    text: String,
    done: Boolean,
) {
    val colors = MichaelTheme.colors
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        if (done) {
            Box(
                Modifier.size(MichaelSize.check).background(colors.chip, CircleShape).border(1.dp, colors.chipBorder, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Image(MichaelIcons.check, null, Modifier.size(MichaelSpace.md), colorFilter = ColorFilter.tint(colors.atext))
            }
        } else {
            Box(Modifier.size(MichaelSize.check), contentAlignment = Alignment.Center) { TypingDots() }
        }
        MichaelText(text, MichaelTextStyle.Label, if (done) colors.muted else colors.text)
    }
}

internal data class FailureActions(
    val retry: () -> Unit,
    val edit: () -> Unit,
    val newChat: () -> Unit,
    val finishSetup: () -> Unit,
    val openHistory: () -> Unit,
)

@Composable
internal fun FailureRow(
    failure: ChatFailure,
    actions: FailureActions,
    clock: Clock,
) {
    val colors = MichaelTheme.colors
    val haptics = LocalHapticFeedback.current
    LaunchedEffect(failure) { haptics.performHapticFeedback(HapticFeedbackType.Reject) }
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.md)) {
        UserBubble(failure.message)
        Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            Image(MichaelIcons.clear, null, Modifier.size(MichaelSize.check), colorFilter = ColorFilter.tint(colors.danger))
            MichaelText(reasonText(failure.reason), MichaelTextStyle.Label, colors.text)
        }
        when (val action = failure.action) {
            ChatFailure.Action.Retry, ChatFailure.Action.ReloadThenRetry -> SmallAction(R.string.chat_action_retry, actions.retry)
            is ChatFailure.Action.RetryAfter -> RetryAfter(action.at, clock, actions.retry)
            ChatFailure.Action.Edit -> SmallAction(R.string.chat_action_edit, actions.edit)
            ChatFailure.Action.NewChat -> SmallAction(R.string.chat_action_new_chat, actions.newChat)
            ChatFailure.Action.FinishSetup -> SmallAction(R.string.chat_action_finish_setup, actions.finishSetup)
            ChatFailure.Action.OpenHistory -> SmallAction(R.string.chat_action_open_history, actions.openHistory)
            ChatFailure.Action.None -> Unit
        }
    }
}

@Composable
private fun RetryAfter(
    at: Instant,
    clock: Clock,
    onRetry: () -> Unit,
) {
    val seconds by produceState(secondsUntil(at, clock), at) {
        while (value > 0) {
            delay(SECOND_MS)
            value = secondsUntil(at, clock)
        }
    }
    if (seconds > 0) {
        MichaelText(
            pluralStringResource(R.plurals.chat_action_wait_seconds, seconds, seconds),
            MichaelTextStyle.Label,
            MichaelTheme.colors.muted,
        )
    } else {
        SmallAction(R.string.chat_action_retry, onRetry)
    }
}

private fun secondsUntil(
    at: Instant,
    clock: Clock,
): Int = maxOf(0L, (at.toEpochMilli() - clock.millis() + SECOND_MS - 1) / SECOND_MS).toInt()

private const val SECOND_MS = 1000L

@Composable
private fun SmallAction(
    text: Int,
    onClick: () -> Unit,
) {
    MichaelButton(stringResource(text), onClick, style = MichaelButtonStyle.Secondary, size = MichaelButtonSize.Small)
}

@Composable
internal fun reasonText(reason: Reason): String =
    when (reason) {
        is Reason.Server -> reason.text
        is Reason.Local -> stringResource(reason.text)
    }

/** The AI provider's data terms ask for the user's word before this message is processed. Asked once a session. */
@Composable
internal fun DataUseNotice(
    message: String,
    onAccept: () -> Unit,
    onDecline: () -> Unit,
) {
    val colors = MichaelTheme.colors
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.md)) {
        UserBubble(message)
        MichaelCard {
            Column(
                Modifier.widthIn(max = MichaelSize.button * READABLE_WIDTH),
                verticalArrangement = Arrangement.spacedBy(MichaelSpace.md),
            ) {
                MichaelText(stringResource(R.string.data_use_title), MichaelTextStyle.Heading, colors.text)
                MichaelText(stringResource(R.string.data_use_body), MichaelTextStyle.Body, colors.muted)
                MichaelButton(stringResource(R.string.data_use_accept), onAccept)
                MichaelButton(stringResource(R.string.data_use_decline), onDecline, style = MichaelButtonStyle.Ghost)
            }
        }
    }
}

private const val READABLE_WIDTH = 12
