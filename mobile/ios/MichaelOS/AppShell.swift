import AssistantFeature
import CalendarFeature
import DesignSystem
import GoalsFeature
import HabitsFeature
import Models
import MyDayFeature
import ReviewFeature
import SettingsFeature
import SwiftUI
import TasksFeature

enum AppTab: Hashable {
    case myDay, tasks, michael, calendar, more
}

enum MoreRoute: Hashable, CaseIterable {
    case habits, goals, review, settings

    var title: String {
        switch self {
        case .habits: String(localized: "more.habits")
        case .goals: String(localized: "more.goals")
        case .review: String(localized: "more.review")
        case .settings: String(localized: "more.settings")
        }
    }

    var symbol: String {
        switch self {
        case .habits: "repeat"
        case .goals: "target"
        case .review: "book.closed"
        case .settings: "gearshape"
        }
    }
}

/// The signed-in app: five tabs, each with its own navigation stack. Tapping the selected tab again returns it to
/// its root.
struct AppShell: View {
    let dependencies: AppDependencies
    @Binding var myDayDate: String
    @Binding var conversation: String
    @Binding var composer: String
    let onSetupRequired: () -> Void
    let onSignOut: () -> Void

    @State private var tab = AppTab.myDay
    @State private var morePath: [MoreRoute] = []
    @State private var tasksPath = NavigationPath()
    /// Moves whenever a screen changes a task or a habit, so the other screens that show them reload.
    @State private var tasksVersion = 0
    @State private var assistantPrompt: AssistantPrompt?
    @Environment(\.colorScheme) private var scheme
    @Environment(\.displayScale) private var displayScale

    var body: some View {
        TabView(selection: selection) {
            NavigationStack {
                MyDayScreen(
                    days: dependencies.days,
                    tasks: dependencies.tasks,
                    habits: dependencies.habits,
                    requestedDate: requestedDate,
                    version: tasksVersion,
                    actions: MyDayActions(
                        ask: { prompt in
                            if let prompt { assistantPrompt = AssistantPrompt(prompt) }
                            tab = .michael
                        },
                        addTask: { tab = .tasks },
                        openCalendar: { tab = .calendar },
                        changed: { tasksVersion += 1 }
                    )
                )
            }
            .tabItem { Label(String(localized: "tab.myDay"), systemImage: "sun.max") }
            .tag(AppTab.myDay)

            NavigationStack(path: $tasksPath) {
                TasksScreen(
                    tasks: dependencies.tasks,
                    intelligence: dependencies.taskIntelligence,
                    profiles: dependencies.profiles,
                    version: tasksVersion,
                    actions: TasksActions(
                        ask: { prompt in
                            assistantPrompt = AssistantPrompt(prompt)
                            tab = .michael
                        },
                        changed: { tasksVersion += 1 }
                    )
                )
            }
            .tabItem { Label(String(localized: "tab.tasks"), systemImage: "checklist") }
            .tag(AppTab.tasks)

            NavigationStack {
                AssistantScreen(
                    repositories: dependencies.assistantRepositories,
                    conversation: $conversation,
                    composer: $composer,
                    prompt: assistantPrompt,
                    actions: AssistantActions(open: open, finishSetup: onSetupRequired)
                )
            }
            .tabItem {
                Label {
                    Text(String(localized: "tab.michael"))
                } icon: {
                    MichaelOrb.tabImage(scheme: scheme, scale: displayScale)
                }
            }
            .tag(AppTab.michael)

            NavigationStack { CalendarPlaceholder() }
                .tabItem { Label(String(localized: "tab.calendar"), systemImage: "calendar") }
                .tag(AppTab.calendar)

            NavigationStack(path: $morePath) {
                MoreScreen(onOpen: { morePath.append($0) }, onSignOut: onSignOut)
                    .navigationDestination(for: MoreRoute.self, destination: moreScreen)
            }
            .tabItem { Label(String(localized: "tab.more"), systemImage: "ellipsis") }
            .tag(AppTab.more)
        }
        .tint(Color.michael.accent)
    }

    /// SwiftUI sets the selection again when the selected tab is tapped; that is the reselect.
    private var selection: Binding<AppTab> {
        Binding(
            get: { tab },
            set: { chosen in
                if chosen == tab, chosen == .more { morePath = [] }
                if chosen == tab, chosen == .tasks { tasksPath = NavigationPath() }
                tab = chosen
            }
        )
    }

    /// Where a record saved from a draft now lives.
    private func open(_ destination: AssistantModel.Destination) {
        switch destination {
        case .tasks: tab = .tasks
        case .calendar: tab = .calendar
        case .goals: showMore(.goals)
        case .habits: showMore(.habits)
        case .settings: showMore(.settings)
        }
    }

    private func showMore(_ route: MoreRoute) {
        morePath = [route]
        tab = .more
    }

    private var requestedDate: Binding<LocalDate?> {
        Binding(get: { LocalDate(myDayDate) }, set: { myDayDate = $0?.description ?? "" })
    }

    @ViewBuilder private func moreScreen(_ route: MoreRoute) -> some View {
        switch route {
        case .habits:
            HabitsScreen(
                habits: dependencies.habits,
                profiles: dependencies.profiles,
                actions: HabitsActions(
                    ask: { prompt in
                        assistantPrompt = AssistantPrompt(prompt)
                        tab = .michael
                    },
                    changed: { tasksVersion += 1 }
                )
            )
        case .goals:
            GoalsScreen(
                goals: dependencies.goals,
                actions: GoalsActions(ask: { prompt in
                    assistantPrompt = AssistantPrompt(prompt)
                    tab = .michael
                })
            )
        case .review:
            ReviewScreen(
                reviews: dependencies.reviews,
                actions: ReviewActions(
                    ask: { prompt in
                        assistantPrompt = AssistantPrompt(prompt)
                        tab = .michael
                    },
                    changed: { tasksVersion += 1 }
                )
            )
        case .settings:
            SettingsScreen(
                accounts: dependencies.accounts,
                actions: SettingsActions(signOut: onSignOut, termsURL: dependencies.termsURL, privacyURL: dependencies.privacyURL)
            )
        }
    }
}

/// The More tab's root. Sign out lives here until Settings is built.
private struct MoreScreen: View {
    let onOpen: (MoreRoute) -> Void
    let onSignOut: () -> Void

    var body: some View {
        MichaelPage {
            Text(String(localized: "tab.more"))
                .michaelText(.display)
                .foregroundStyle(Color.michael.text)
                .accessibilityAddTraits(.isHeader)
            MichaelCard {
                VStack(spacing: 0) {
                    ForEach(MoreRoute.allCases, id: \.self) { route in
                        Button {
                            onOpen(route)
                        } label: {
                            HStack(spacing: MichaelSpace.md) {
                                Image(systemName: route.symbol)
                                    .foregroundStyle(Color.michael.muted)
                                    .frame(width: MichaelSize.check)
                                    .accessibilityHidden(true)
                                Text(route.title)
                                    .michaelText(.body)
                                    .foregroundStyle(Color.michael.text)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                Image(systemName: "chevron.right")
                                    .foregroundStyle(Color.michael.faint)
                                    .accessibilityHidden(true)
                            }
                            .frame(minHeight: MichaelSize.button)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        } footer: {
            MichaelButton(String(localized: "more.signOut"), style: .secondary, action: onSignOut)
        }
        .toolbar(.hidden, for: .navigationBar)
    }
}
