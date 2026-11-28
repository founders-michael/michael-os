package com.michaelos.feature.calendar

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.UnscheduledTask

/** Open tasks with no future session, due first. Choosing one opens the editor as a focus session for it. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun UnscheduledSheet(
    tasks: List<UnscheduledTask>,
    onClose: () -> Unit,
    onSchedule: (UnscheduledTask) -> Unit,
) {
    val colors = MichaelTheme.colors
    ModalBottomSheet(onDismissRequest = onClose, containerColor = colors.bg) {
        LazyColumn(Modifier.fillMaxWidth().padding(horizontal = MichaelSpace.screenGutter)) {
            item {
                Column(Modifier.padding(bottom = MichaelSpace.md), verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
                    MichaelText(
                        stringResource(R.string.calendar_unscheduled_title),
                        MichaelTextStyle.Heading,
                        colors.text,
                        Modifier.semantics { heading() },
                    )
                    MichaelText(stringResource(R.string.calendar_unscheduled_intro), MichaelTextStyle.Body, colors.muted)
                }
            }
            items(tasks, key = { it.id }) { task ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = MichaelSize.button + MichaelSpace.lg)
                        .clickable(
                            role = Role.Button,
                            onClickLabel = stringResource(R.string.calendar_unscheduled_schedule),
                        ) { onSchedule(task) },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(MichaelSpace.md),
                ) {
                    Column(Modifier.weight(1f).padding(vertical = MichaelSpace.sm)) {
                        MichaelText(task.title, MichaelTextStyle.Body, colors.text, maxLines = 2)
                        MichaelText(detail(task), MichaelTextStyle.Caption, colors.muted)
                    }
                    MichaelText(stringResource(R.string.calendar_unscheduled_schedule), MichaelTextStyle.Label, colors.atext)
                }
                HorizontalDivider(color = colors.border)
            }
        }
    }
}

@Composable
private fun detail(task: UnscheduledTask): String {
    val parts = mutableListOf<String>()
    task.dueDate?.let { parts += stringResource(R.string.calendar_unscheduled_due, CalendarFormat.shortDate(it)) }
    parts +=
        when (val minutes = task.estimatedDurationMinutes) {
            null -> stringResource(R.string.calendar_unscheduled_no_estimate)
            else -> pluralStringResource(R.plurals.calendar_unscheduled_minutes, minutes, minutes)
        }
    return parts.joinToString(" · ")
}
