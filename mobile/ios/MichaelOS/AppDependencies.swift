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
    let termsURL: URL
    let privacyURL: URL

    static func live() -> AppDependencies {
        let store = KeychainTokenStore()
        StaleTokenCheck.run(store: store, defaults: .standard)
        let session = Session(store: store)
        let client = APIClient(baseURL: configuredURL("MichaelAPIBaseURL"), credentials: session)
        let authenticator = Authenticator(client: client, session: session)
        return AppDependencies(
            session: session,
            authenticator: authenticator,
            auth: RemoteAuthRepository(authenticator: authenticator),
            profiles: RemoteProfileRepository(client: client),
            tasks: RemoteTaskRepository(client: client),
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
