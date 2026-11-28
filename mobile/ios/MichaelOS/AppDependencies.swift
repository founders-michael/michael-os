import AssistantFeature
import Auth
import Foundation
import Networking
import Repositories

/// The composition root: the one place the app's shared objects are built and connected.
@MainActor
struct AppDependencies {
    let session: Session
    let authenticator: Authenticator
    let auth: any AuthRepository
    let profiles: any ProfileRepository
    let tasks: any TaskRepository
    let taskIntelligence: any TaskIntelligenceRepository
    let days: any MyDayRepository
    let habits: any HabitRepository
    let goals: any GoalRepository
    let reviews: any ReviewRepository
    let assistantRepositories: AssistantRepositories
    let termsURL: URL
    let privacyURL: URL

    static func live() -> AppDependencies {
        let store = KeychainTokenStore()
        StaleTokenCheck.run(store: store, defaults: .standard)
        let session = Session(store: store)
        let client = APIClient(baseURL: configuredURL("MichaelAPIBaseURL"), credentials: session)
        let authenticator = Authenticator(client: client, session: session)
        let tasks = RemoteTaskRepository(client: client)
        let habits = RemoteHabitRepository(client: client)
        let goals = RemoteGoalRepository(client: client)
        return AppDependencies(
            session: session,
            authenticator: authenticator,
            auth: RemoteAuthRepository(authenticator: authenticator),
            profiles: RemoteProfileRepository(client: client),
            tasks: tasks,
            taskIntelligence: RemoteTaskIntelligenceRepository(client: client),
            days: RemoteMyDayRepository(client: client),
            habits: habits,
            goals: goals,
            reviews: RemoteReviewRepository(client: client),
            assistantRepositories: AssistantRepositories(
                assistant: RemoteAssistantRepository(client: client),
                tasks: tasks,
                goals: goals,
                habits: habits,
                calendar: RemoteCalendarRepository(client: client),
                memories: RemoteMemoryRepository(client: client)
            ),
            termsURL: configuredURL("MichaelTermsURL"),
            privacyURL: configuredURL("MichaelPrivacyURL")
        )
    }

    private static func configuredURL(_ key: String) -> URL {
        guard let text = Bundle.main.object(forInfoDictionaryKey: key) as? String, let url = URL(string: text) else {
            fatalError("\(key) is missing from Info.plist; it comes from Config/*.xcconfig.")
        }
        return url
    }
}
