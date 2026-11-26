package com.michaelos.feature.tasks

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.michaelos.core.designsystem.component.AICard
import com.michaelos.core.designsystem.component.EmptyStateView
import com.michaelos.core.designsystem.component.ErrorBanner
import com.michaelos.core.designsystem.component.FailureStateView
import com.michaelos.core.designsystem.component.MichaelBackground
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonSize
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelIcons
import com.michaelos.core.designsystem.component.MichaelOrb
import com.michaelos.core.designsystem.component.MichaelOrbSize
import com.michaelos.core.designsystem.component.SkeletonBlock
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.Task
import com.michaelos.core.model.TaskPriority
import com.michaelos.core.model.TaskQuery
import com.michaelos.core.model.TaskSort
import com.michaelos.core.model.TaskView
import java.util.UUID

/** Where the task screens send the user. */
class TasksActions(
    /** Opens Michael with a drafting request filled in. It is never sent on the user's behalf. */
    val ask: (String) -> Unit,
    val open: (TaskDetailKey) -> Unit,
)

/** An editor sheet the user opened: for a new task, or for [task]. The id keeps a sheet's typing across rotation. */
internal data class EditorRequest(
    val id: String = UUID.randomUUID().toString(),
    val taskId: String? = null,
)

@Composable
fun TasksScreen(
    actions: TasksActions,
    viewModel: TasksViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()
    val search by viewModel.searchText.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_START) { viewModel.appear() }
    var editorId by rememberSaveable { mutableStateOf<String?>(null) }
    val haptics = LocalHapticFeedback.current
    val rollbacks = viewModel.list?.rollbacks?.size ?: 0
    var rollbacksSeen by remember { mutableIntStateOf(0) }
    LaunchedEffect(rollbacks) {
        if (rollbacks > rollbacksSeen) haptics.performHapticFeedback(HapticFeedbackType.Reject)
        rollbacksSeen = rollbacks
    }
    MichaelBackground(Modifier.fillMaxSize()) {
        when (val current = state) {
            TasksUiState.Loading -> {
                TasksSkeleton()
            }

            is TasksUiState.Failed -> {
                FailureStateView(current.error.loadMessage(), viewModel::load, Modifier.align(Alignment.Center))
            }

            is TasksUiState.Content -> {
                TaskListView(current.list, false, query, search, viewModel, actions) {
                    editorId =
                        UUID.randomUUID().toString()
                }
            }

            is TasksUiState.Empty -> {
                TaskListView(current.list, true, query, search, viewModel, actions) {
                    editorId =
                        UUID.randomUUID().toString()
                }
            }
        }
    }
    val list = viewModel.list
    val requestId = editorId
    if (requestId != null && list != null) {
        TaskEditorSheet(
            request = EditorRequest(requestId),
            task = null,
            timeZone = list.timeZone,
            today = list.summary?.today,
            onSaved = { viewModel.changed() },
            onClose = { editorId = null },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TaskListView(
    list: TaskList,
    isEmpty: Boolean,
    query: TaskQuery,
    search: String,
    viewModel: TasksViewModel,
    actions: TasksActions,
    onCreate: () -> Unit,
) {
    val colors = MichaelTheme.colors
    val zone = zoneOf(list.timeZone)
    var explained by remember { mutableStateOf<com.michaelos.core.model.RankedTask?>(null) }
    explained?.let { PriorityBreakdownSheet(it) { explained = null } }
    PullToRefreshBox(isRefreshing = list.isRefreshing, onRefresh = viewModel::refresh, modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding =
                androidx.compose.foundation.layout.PaddingValues(
                    horizontal = MichaelSpace.screenGutter,
                    vertical = MichaelSpace.lg,
                ),
            verticalArrangement = Arrangement.spacedBy(MichaelSpace.md),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    MichaelText(
                        stringResource(R.string.tasks_title),
                        MichaelTextStyle.Display,
                        colors.text,
                        modifier = Modifier.weight(1f).semantics { heading() },
                    )
                    val newTask = stringResource(R.string.tasks_new)
                    Box(
                        Modifier
                            .size(MichaelSize.checkTouch)
                            .background(colors.fill, RoundedCornerShape(MichaelRadius.button))
                            .clickable(role = Role.Button, onClickLabel = newTask, onClick = onCreate)
                            .semantics { contentDescription = newTask },
                        contentAlignment = Alignment.Center,
                    ) { Image(MichaelIcons.plus, null, Modifier.size(MichaelSize.check), colorFilter = ColorFilter.tint(colors.onfill)) }
                }
            }
            if (query.sort != TaskSort.Michael) item { SearchField(search, viewModel::search) }
            item { CaptureBar(actions.ask) }
            if (query.sort == TaskSort.Michael) {
                item { MichaelText(stringResource(R.string.tasks_michael_note), MichaelTextStyle.Caption, colors.muted) }
            } else {
                item {
                    ChoiceControl(
                        options = TaskView.entries,
                        selected = query.view,
                        label = stringResource(R.string.tasks_view_label),
                        onSelect = viewModel::select,
                        title = { viewTitle(it) },
                    )
                }
            }
            item { ListHeader(list, query, viewModel) }
            list.refreshProblem?.let { problem -> item { ErrorBanner(problem.loadMessage()) } }
            if (isEmpty) {
                item { TasksEmptyState(query, onCreate) }
            } else {
                items(list.tasks, key = Task::id) { task ->
                    TaskRow(
                        task = task,
                        status = list.statusOf(task),
                        today = list.summary?.today,
                        zone = zone,
                        rollback = list.rollbacks[task.id],
                        onToggle = { viewModel.toggle(task.id) },
                        onOpen = { actions.open(TaskDetailKey(task.id, list.timeZone, list.summary?.today?.toString())) },
                        ranked = list.ranking[task.id],
                        onExplain = { explained = list.ranking[task.id] },
                    )
                    if (task.id == list.tasks.lastOrNull()?.id) LaunchedEffect(task.id) { viewModel.loadMore() }
                }
                item { ListFooter(list, viewModel::loadMore) }
            }
        }
    }
}

@Composable
private fun ListHeader(
    list: TaskList,
    query: TaskQuery,
    viewModel: TasksViewModel,
) {
    val colors = MichaelTheme.colors
    var open by remember { mutableStateOf(false) }
    Row(verticalAlignment = Alignment.CenterVertically) {
        val total = pluralStringResource(R.plurals.tasks_count, list.total, list.total)
        val overdue = list.summary?.overdue ?: 0
        val count =
            if (overdue > 0 &&
                query.view != TaskView.Overdue
            ) {
                pluralStringResource(R.plurals.tasks_count_overdue, overdue, total, overdue)
            } else {
                total
            }
        MichaelText(count, MichaelTextStyle.Label, colors.muted, modifier = Modifier.weight(1f))
        Box {
            val sort = sortTitle(query.sort)
            val label = stringResource(R.string.tasks_sort_and_filter, sort)
            Row(
                Modifier
                    .clickable(role = Role.Button, onClickLabel = label) { open = true }
                    .semantics { contentDescription = label }
                    .padding(vertical = MichaelSpace.sm),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MichaelSpace.xs),
            ) {
                Image(MichaelIcons.filter, null, Modifier.size(MichaelSize.check), colorFilter = ColorFilter.tint(colors.muted))
                MichaelText(sort, MichaelTextStyle.Label, colors.muted)
            }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                MenuHeading(stringResource(R.string.tasks_sort))
                TaskSort.entries.forEach { option ->
                    MenuChoice(sortTitle(option), option == query.sort) {
                        open = false
                        viewModel.select(option)
                    }
                }
                if (query.sort != TaskSort.Michael) {
                    HorizontalDivider()
                    MenuHeading(stringResource(R.string.tasks_priority_filter))
                    (listOf<TaskPriority?>(null) + listOf(TaskPriority.High, TaskPriority.Medium, TaskPriority.Low)).forEach { option ->
                        val title = option?.let { priorityText(it) } ?: stringResource(R.string.tasks_priority_any)
                        MenuChoice(title, option == query.priority) {
                            open = false
                            viewModel.select(option)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MenuHeading(text: String) {
    MichaelText(
        text,
        MichaelTextStyle.Caption,
        MichaelTheme.colors.muted,
        modifier = Modifier.padding(horizontal = MichaelSpace.lg, vertical = MichaelSpace.xs),
    )
}

@Composable
private fun MenuChoice(
    text: String,
    chosen: Boolean,
    onClick: () -> Unit,
) {
    val colors = MichaelTheme.colors
    DropdownMenuItem(
        text = { MichaelText(text, MichaelTextStyle.Body, if (chosen) colors.atext else colors.text) },
        onClick = onClick,
        trailingIcon =
            if (chosen) {
                (
                    {
                        Image(MichaelIcons.check, null, Modifier.size(MichaelSize.check), colorFilter = ColorFilter.tint(colors.atext))
                    }
                )
            } else {
                null
            },
        modifier = Modifier.semantics { if (chosen) contentDescription = "$text, ✓" },
    )
}

@Composable
private fun ListFooter(
    list: TaskList,
    onRetry: () -> Unit,
) {
    when {
        list.isLoadingMore -> {
            Box(Modifier.fillMaxWidth().padding(MichaelSpace.md), contentAlignment = Alignment.Center) {
                val label = stringResource(R.string.tasks_loading_more)
                CircularProgressIndicator(
                    Modifier.size(MichaelSize.check).semantics { contentDescription = label },
                    color = MichaelTheme.colors.accent,
                )
            }
        }

        list.moreProblem != null -> {
            Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
                ErrorBanner(list.moreProblem.loadMessage())
                MichaelButton(
                    stringResource(R.string.tasks_load_more_retry),
                    onRetry,
                    style = MichaelButtonStyle.Secondary,
                    size = MichaelButtonSize.Small,
                )
            }
        }
    }
}

@Composable
private fun SearchField(
    text: String,
    onChange: (String) -> Unit,
) {
    val colors = MichaelTheme.colors
    val label = stringResource(R.string.tasks_search)
    BasicTextField(
        value = text,
        onValueChange = onChange,
        singleLine = true,
        textStyle = MichaelTextStyle.Body.textStyle.copy(color = colors.text),
        cursorBrush = SolidColor(colors.accent),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
        modifier = Modifier.fillMaxWidth().semantics { contentDescription = label },
        decorationBox = { field ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(colors.raise, RoundedCornerShape(MichaelRadius.field))
                    .padding(horizontal = MichaelSpace.md, vertical = MichaelSpace.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.weight(1f)) {
                    if (text.isEmpty()) MichaelText(label, MichaelTextStyle.Body, colors.faint)
                    field()
                }
                if (text.isNotEmpty()) {
                    Image(
                        MichaelIcons.clear,
                        contentDescription = null,
                        modifier = Modifier.size(MichaelSize.check).clickable(role = Role.Button) { onChange("") },
                        colorFilter = ColorFilter.tint(colors.faint),
                    )
                }
            }
        },
    )
}

/**
 * Natural-language capture: the words go to Michael as a drafting request, which the user then sends. Michael's draft
 * card shows what he understood before anything is saved.
 */
@Composable
private fun CaptureBar(ask: (String) -> Unit) {
    val colors = MichaelTheme.colors
    var text by rememberSaveable { mutableStateOf("") }
    val prompt = stringResource(R.string.tasks_capture_prompt, text.trim())
    val send = {
        if (text.isNotBlank()) {
            ask(prompt)
            text = ""
        }
    }
    AICard {
        Row(Modifier.padding(start = MichaelSpace.md, end = MichaelSpace.xs), verticalAlignment = Alignment.CenterVertically) {
            MichaelOrb(MichaelOrbSize.Small)
            val label = stringResource(R.string.tasks_capture_label)
            BasicTextField(
                value = text,
                onValueChange = { text = it.take(CAPTURE_LIMIT) },
                singleLine = true,
                textStyle = MichaelTextStyle.Body.textStyle.copy(color = colors.text),
                cursorBrush = SolidColor(colors.accent),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { send() }),
                modifier = Modifier.weight(1f).padding(horizontal = MichaelSpace.sm).semantics { contentDescription = label },
                decorationBox = { field ->
                    Box {
                        if (text.isEmpty()) {
                            MichaelText(
                                stringResource(R.string.tasks_capture_placeholder),
                                MichaelTextStyle.Body,
                                colors.faint,
                            )
                        }
                        field()
                    }
                },
            )
            val sendLabel = stringResource(R.string.tasks_capture_send)
            Box(
                Modifier
                    .size(MichaelSize.checkTouch)
                    .clickable(enabled = text.isNotBlank(), role = Role.Button, onClickLabel = sendLabel) { send() }
                    .semantics { contentDescription = sendLabel },
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    MichaelIcons.arrowRight,
                    null,
                    Modifier.size(MichaelSize.check),
                    colorFilter = ColorFilter.tint(if (text.isBlank()) colors.faint else colors.text),
                )
            }
        }
    }
}

@Composable
private fun TasksEmptyState(
    query: TaskQuery,
    onCreate: () -> Unit,
) {
    val colors = MichaelTheme.colors
    if (query.view == TaskView.All && query.priority == null && query.search.isBlank()) {
        EmptyStateView(
            title = stringResource(R.string.tasks_empty_title),
            message = stringResource(R.string.tasks_empty_message),
            actionText = stringResource(R.string.tasks_empty_action),
            onAction = onCreate,
        )
        return
    }
    val title =
        when {
            query.search.isNotBlank() -> stringResource(R.string.tasks_empty_search, query.search)
            query.view == TaskView.Overdue -> stringResource(R.string.tasks_empty_overdue)
            query.view == TaskView.Completed -> stringResource(R.string.tasks_empty_completed)
            query.view == TaskView.Pending -> stringResource(R.string.tasks_empty_pending)
            else -> stringResource(R.string.tasks_empty_priority)
        }
    Column(
        Modifier.fillMaxWidth().padding(vertical = MichaelSpace.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
    ) {
        MichaelText(title, MichaelTextStyle.Title, colors.text)
        MichaelText(stringResource(R.string.tasks_empty_filtered_message), MichaelTextStyle.Body, colors.muted)
    }
}

@Composable
private fun TasksSkeleton() {
    val label = stringResource(R.string.tasks_loading)
    Column(
        Modifier.fillMaxSize().padding(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.lg).semantics {
            contentDescription =
                label
        },
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.md),
    ) {
        repeat(SKELETON_ROWS) { SkeletonBlock(MichaelSize.field, Modifier.fillMaxWidth()) }
    }
}

@Composable
private fun viewTitle(view: TaskView): String =
    stringResource(
        when (view) {
            TaskView.All -> R.string.tasks_view_all
            TaskView.Pending -> R.string.tasks_view_pending
            TaskView.Completed -> R.string.tasks_view_completed
            TaskView.Overdue -> R.string.tasks_view_overdue
        },
    )

@Composable
private fun sortTitle(sort: TaskSort): String =
    stringResource(
        when (sort) {
            TaskSort.Recent -> R.string.tasks_sort_recent
            TaskSort.DueDate -> R.string.tasks_sort_due_date
            TaskSort.Priority -> R.string.tasks_sort_priority
            TaskSort.Michael -> R.string.tasks_sort_michael
        },
    )

private const val CAPTURE_LIMIT = 340
private const val SKELETON_ROWS = 7
