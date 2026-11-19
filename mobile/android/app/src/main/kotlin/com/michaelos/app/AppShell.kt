package com.michaelos.app

import androidx.activity.compose.BackHandler
import androidx.annotation.StringRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Density
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.viewmodel.navigation3.rememberViewModelStoreNavEntryDecorator
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberDecoratedNavEntries
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import androidx.navigation3.ui.NavDisplay
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelCard
import com.michaelos.core.designsystem.component.MichaelIcons
import com.michaelos.core.designsystem.component.MichaelOrb
import com.michaelos.core.designsystem.component.MichaelOrbSize
import com.michaelos.core.designsystem.component.MichaelPage
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.feature.assistant.AssistantPlaceholder
import com.michaelos.feature.calendar.CalendarPlaceholder
import com.michaelos.feature.goals.GoalsPlaceholder
import com.michaelos.feature.habits.HabitsPlaceholder
import com.michaelos.feature.myday.MyDayActions
import com.michaelos.feature.myday.MyDayKey
import com.michaelos.feature.myday.MyDayScreen
import com.michaelos.feature.review.ReviewPlaceholder
import com.michaelos.feature.settings.SettingsPlaceholder
import com.michaelos.feature.tasks.TasksPlaceholder
import kotlinx.serialization.Serializable
import kotlin.math.min

@Serializable
private data object TasksKey : NavKey

@Serializable
private data object MichaelKey : NavKey

@Serializable
private data object CalendarKey : NavKey

@Serializable
private data object MoreKey : NavKey

@Serializable
private data class MoreDetailKey(
    val route: MoreRoute,
) : NavKey

@Serializable
private enum class MoreRoute(
    @param:StringRes val title: Int,
) {
    Habits(R.string.more_habits),
    Goals(R.string.more_goals),
    Review(R.string.more_review),
    Settings(R.string.more_settings),
    ;

    val icon: ImageVector
        get() =
            when (this) {
                Habits -> MichaelIcons.habits
                Goals -> MichaelIcons.goals
                Review -> MichaelIcons.review
                Settings -> MichaelIcons.settings
            }
}

private enum class AppTab(
    @param:StringRes val label: Int,
) {
    MyDay(R.string.tab_my_day),
    Tasks(R.string.tab_tasks),
    Michael(R.string.tab_michael),
    Calendar(R.string.tab_calendar),
    More(R.string.tab_more),
}

/**
 * The signed-in app: five tabs, each with its own back stack. Tapping the selected tab again returns it to its
 * root; back from a tab's root goes to My Day, then leaves the app. [sessionScope] holds the screens' view models,
 * so signing out clears them and the next account starts fresh.
 */
@Composable
fun AppShell(
    sessionScope: ViewModelStoreOwner,
    onSignOut: () -> Unit,
) {
    var tab by rememberSaveable { mutableStateOf(AppTab.MyDay) }
    var assistantPrompt by rememberSaveable { mutableStateOf<String?>(null) }
    val stacks =
        mapOf(
            AppTab.MyDay to rememberNavBackStack(MyDayKey),
            AppTab.Tasks to rememberNavBackStack(TasksKey),
            AppTab.Michael to rememberNavBackStack(MichaelKey),
            AppTab.Calendar to rememberNavBackStack(CalendarKey),
            AppTab.More to rememberNavBackStack(MoreKey),
        )
    val more = stacks.getValue(AppTab.More)
    val actions =
        MyDayActions(
            ask = { prompt ->
                assistantPrompt = prompt
                tab = AppTab.Michael
            },
            addTask = { tab = AppTab.Tasks },
            openCalendar = { tab = AppTab.Calendar },
        )
    val provider =
        entryProvider {
            entry<MyDayKey> { MyDayScreen(actions) }
            entry<TasksKey> { TasksPlaceholder() }
            entry<MichaelKey> { AssistantPlaceholder(assistantPrompt) }
            entry<CalendarKey> { CalendarPlaceholder() }
            entry<MoreKey> { MoreScreen(onOpen = { more.add(MoreDetailKey(it)) }, onSignOut = onSignOut) }
            entry<MoreDetailKey> { key ->
                when (key.route) {
                    MoreRoute.Habits -> HabitsPlaceholder()
                    MoreRoute.Goals -> GoalsPlaceholder()
                    MoreRoute.Review -> ReviewPlaceholder()
                    MoreRoute.Settings -> SettingsPlaceholder()
                }
            }
        }
    // Decorating every tab's entries on every pass keeps the tabs that are not shown alive: their state and view
    // models stay until their entries leave their own back stack.
    val decorators =
        listOf(
            rememberSaveableStateHolderNavEntryDecorator<NavKey>(),
            rememberViewModelStoreNavEntryDecorator<NavKey>(sessionScope),
        )
    val entries = AppTab.entries.associateWith { rememberDecoratedNavEntries(stacks.getValue(it), decorators, provider) }
    val stack = stacks.getValue(tab)

    BackHandler(enabled = tab != AppTab.MyDay && stack.size == 1) { tab = AppTab.MyDay }
    Scaffold(
        containerColor = MichaelTheme.colors.bg,
        bottomBar = {
            ShellBar(tab) { chosen ->
                if (chosen == tab) stacks.getValue(chosen).popToRoot() else tab = chosen
            }
        },
    ) { padding ->
        NavDisplay(entries = entries.getValue(tab), onBack = { stack.removeLastOrNull() }, modifier = Modifier.padding(padding))
    }
}

private fun NavBackStack<NavKey>.popToRoot() {
    while (size > 1) removeAt(lastIndex)
}

// Five labels share the bar's width. Past this scale they break mid-word, so they stop growing, as the iOS tab bar's
// labels do.
private const val MAX_BAR_FONT_SCALE = 1.3f

@Composable
private fun ShellBar(
    selected: AppTab,
    onSelect: (AppTab) -> Unit,
) {
    val colors = MichaelTheme.colors
    val itemColors =
        NavigationBarItemDefaults.colors(
            selectedIconColor = colors.accent,
            selectedTextColor = colors.atext,
            indicatorColor = colors.raise,
            unselectedIconColor = colors.muted,
            unselectedTextColor = colors.muted,
        )
    NavigationBar(containerColor = colors.solid) {
        AppTab.entries.forEach { tab ->
            NavigationBarItem(
                selected = tab == selected,
                onClick = { onSelect(tab) },
                icon = {
                    when (tab) {
                        AppTab.MyDay -> Icon(MichaelIcons.myDay, contentDescription = null)
                        AppTab.Tasks -> Icon(MichaelIcons.tasks, contentDescription = null)
                        AppTab.Michael -> MichaelOrb(MichaelOrbSize.Small)
                        AppTab.Calendar -> Icon(MichaelIcons.calendar, contentDescription = null)
                        AppTab.More -> Icon(MichaelIcons.more, contentDescription = null)
                    }
                },
                label = {
                    val density = LocalDensity.current
                    CompositionLocalProvider(
                        LocalDensity provides Density(density.density, min(density.fontScale, MAX_BAR_FONT_SCALE)),
                    ) {
                        Text(stringResource(tab.label), style = MichaelTextStyle.Caption.textStyle, maxLines = 1, softWrap = false)
                    }
                },
                colors = itemColors,
            )
        }
    }
}

/** The More tab's root. Sign out lives here until Settings is built. */
@Composable
private fun MoreScreen(
    onOpen: (MoreRoute) -> Unit,
    onSignOut: () -> Unit,
) {
    val colors = MichaelTheme.colors
    MichaelPage(
        footer = {
            MichaelButton(stringResource(R.string.more_sign_out), onSignOut, Modifier.fillMaxWidth(), MichaelButtonStyle.Secondary)
        },
    ) {
        MichaelText(stringResource(R.string.tab_more), MichaelTextStyle.Display, colors.text, Modifier.semantics { heading() })
        MichaelCard(Modifier.fillMaxWidth()) {
            Column {
                MoreRoute.entries.forEach { route ->
                    Row(
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .defaultMinSize(minHeight = MichaelSize.button)
                                .clickable(role = Role.Button) { onOpen(route) },
                        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.md),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Image(route.icon, contentDescription = null, colorFilter = ColorFilter.tint(colors.muted))
                        MichaelText(stringResource(route.title), MichaelTextStyle.Body, colors.text, Modifier.weight(1f))
                        Image(MichaelIcons.chevronRight, contentDescription = null, colorFilter = ColorFilter.tint(colors.faint))
                    }
                }
            }
        }
    }
}
