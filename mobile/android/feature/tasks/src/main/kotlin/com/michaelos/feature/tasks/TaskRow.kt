package com.michaelos.feature.tasks

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextDecoration
import com.michaelos.core.designsystem.component.MichaelCheck
import com.michaelos.core.designsystem.component.MichaelChip
import com.michaelos.core.designsystem.component.MichaelChipTone
import com.michaelos.core.designsystem.component.MichaelIcons
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.Task
import com.michaelos.core.model.TaskStatus
import java.time.LocalDate
import java.time.ZoneId

/** One task in the list: the check beside a link that opens the task. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun TaskRow(
    task: Task,
    status: TaskStatus,
    today: LocalDate?,
    zone: ZoneId,
    rollback: TaskRollback?,
    onToggle: () -> Unit,
    onOpen: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val done = status == TaskStatus.Completed
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(vertical = MichaelSpace.sm), verticalAlignment = Alignment.Top) {
            val checkLabel = stringResource(if (done) R.string.tasks_row_reopen else R.string.tasks_row_complete, task.title)
            MichaelCheck(checked = done, label = checkLabel, onCheckedChange = { onToggle() })
            Row(
                Modifier
                    .weight(1f)
                    .clickable(role = Role.Button, onClick = onOpen)
                    .semantics(mergeDescendants = true) {}
                    .padding(start = MichaelSpace.sm),
                verticalAlignment = Alignment.Top,
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
                    MichaelText(
                        task.title,
                        MichaelTextStyle.Body,
                        if (done) colors.muted else colors.text,
                        textDecoration = if (done) TextDecoration.LineThrough else null,
                    )
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
                        verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs),
                    ) {
                        MichaelText(
                            dueText(task, today),
                            MichaelTextStyle.Caption,
                            if (TaskFormat.isOverdue(task, today)) colors.warn else colors.muted,
                        )
                        MichaelText(priorityText(task.priority), MichaelTextStyle.Caption, colors.muted)
                        task.estimatedDurationMinutes?.let { MichaelText(minutesText(it), MichaelTextStyle.Caption, colors.muted) }
                        if (status == TaskStatus.InProgress) MichaelChip(statusText(TaskStatus.InProgress), tone = MichaelChipTone.Ai)
                    }
                    task.activeRecurrence?.let { Labelled(MichaelIcons.repeat, it.label) }
                    task.pendingReminder?.let { Labelled(MichaelIcons.bell, reminderText(it, zone)) }
                }
                Image(
                    MichaelIcons.chevronRight,
                    null,
                    Modifier.padding(top = MichaelSpace.xs).size(MichaelSize.check),
                    colorFilter = ColorFilter.tint(colors.faint),
                )
            }
        }
        rollback?.let {
            MichaelText(
                rollbackText(it),
                MichaelTextStyle.Caption,
                colors.danger,
                modifier = Modifier.padding(start = MichaelSize.checkTouch, bottom = MichaelSpace.sm),
            )
        }
        HorizontalDivider(color = colors.border)
    }
}

@Composable
private fun Labelled(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    text: String,
) {
    val colors = MichaelTheme.colors
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
        Image(icon, null, Modifier.size(MichaelSpace.lg), colorFilter = ColorFilter.tint(colors.muted))
        MichaelText(text, MichaelTextStyle.Caption, colors.muted)
    }
}
