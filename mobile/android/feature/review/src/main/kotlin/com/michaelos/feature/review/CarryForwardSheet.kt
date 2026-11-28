package com.michaelos.feature.review

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.michaelos.core.designsystem.component.MichaelDatePickerDialog
import com.michaelos.core.designsystem.component.MichaelFieldButton
import com.michaelos.core.designsystem.component.MichaelTimePickerDialog
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.Task
import java.time.LocalDate
import java.time.LocalTime

/** Pick a day, and optionally a time, for a missed task. The sheet closes on Move; the row says how it went. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CarryForwardSheet(
    task: Task,
    review: LocalDate,
    today: LocalDate,
    onMove: (CarryForwardForm) -> Unit,
    onClose: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val earliest = CarryForwardForm.earliest(review, today)
    var date by rememberSaveable { mutableStateOf(earliest) }
    var start by rememberSaveable { mutableStateOf<LocalTime?>(null) }
    var end by rememberSaveable { mutableStateOf<LocalTime?>(null) }
    var showsProblem by rememberSaveable { mutableStateOf(false) }
    var pickingDate by rememberSaveable { mutableStateOf(false) }
    val form = CarryForwardForm(date, start, end)
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onClose, sheetState = sheet, containerColor = colors.bg) {
        Column(Modifier.fillMaxWidth()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = MichaelSpace.sm), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onClose) { Text(stringResource(R.string.review_move_cancel), color = colors.text) }
                MichaelText(stringResource(R.string.review_move_title), MichaelTextStyle.Label, colors.text, Modifier.weight(1f))
                TextButton(onClick = {
                    showsProblem = true
                    if (form.problem(review, today) == null) {
                        onMove(form)
                        onClose()
                    }
                }) { Text(stringResource(R.string.review_move_confirm), color = colors.atext) }
            }
            Column(
                Modifier.padding(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.md),
                verticalArrangement = Arrangement.spacedBy(MichaelSpace.md),
            ) {
                MichaelText(task.title, MichaelTextStyle.Heading, colors.text)
                val dateLabel = stringResource(R.string.review_move_date)
                MichaelText(dateLabel, MichaelTextStyle.Label, colors.muted)
                MichaelFieldButton(text = dayText(date), label = dateLabel, onClick = { pickingDate = true })
                TimeField(stringResource(R.string.review_move_start), start) { start = it }
                TimeField(stringResource(R.string.review_move_end), end) { end = it }
                val problem = form.problem(review, today)
                if (showsProblem && problem != null) {
                    MichaelText(problemText(problem), MichaelTextStyle.Caption, colors.danger)
                } else {
                    MichaelText(stringResource(R.string.review_move_hint), MichaelTextStyle.Caption, colors.faint)
                }
            }
        }
    }
    if (pickingDate) {
        MichaelDatePickerDialog(
            initial = date,
            onPick = { date = if (it < earliest) earliest else it },
            onDismiss = { pickingDate = false },
        )
    }
}

@Composable
private fun TimeField(
    label: String,
    value: LocalTime?,
    onChange: (LocalTime?) -> Unit,
) {
    var picking by rememberSaveable { mutableStateOf(false) }
    MichaelText(label, MichaelTextStyle.Label, MichaelTheme.colors.muted)
    MichaelFieldButton(
        text = value?.let { timeText(it) } ?: stringResource(R.string.review_move_add),
        label = label,
        onClick = { picking = true },
        clearLabel = value?.let { stringResource(R.string.review_move_clear, label) },
        onClear = value?.let { { onChange(null) } },
    )
    if (picking) {
        MichaelTimePickerDialog(
            initial = value ?: DEFAULT_TIME,
            title = label,
            onPick = {
                picking = false
                onChange(it)
            },
            onDismiss = { picking = false },
        )
    }
}

private val DEFAULT_TIME: LocalTime = LocalTime.of(9, 0)
