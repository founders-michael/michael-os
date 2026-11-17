import Auth
import Foundation
import Networking
import Repositories

/// The composition root: the one place the app's shared objects are built and connected.
@MainActor
struct AppDependencies {
    let session: Session
    let authenticator: Authenticator
    let tasks: any TaskRepository

    static func live() -> AppDependencies {
        guard let text = Bundle.main.object(forInfoDictionaryKey: "MichaelAPIBaseURL") as? String,
            let baseURL = URL(string: text)
        else {
            fatalError("MichaelAPIBaseURL is missing from Info.plist; it comes from API_BASE_URL in Config/*.xcconfig.")
        }
        let session = Session(store: KeychainTokenStore())
        let client = APIClient(baseURL: baseURL, credentials: session)
        return AppDependencies(
            session: session,
            authenticator: Authenticator(client: client, session: session),
            tasks: RemoteTaskRepository(client: client)
        )
    }
}
