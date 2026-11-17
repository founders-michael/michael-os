import Auth
import Foundation
import Models
import Observation
import Repositories

/// Decides the first screen, as drawn under "Launch" in mobile/design/flows.md, and again whenever the session
/// changes.
@MainActor
@Observable
final class LaunchModel {
    enum Destination: Equatable {
        case checking
        case signedOut
        case onboarding(suggestedName: String)
        case home
    }

    private(set) var destination: Destination = .checking
    private let session: Session
    private let authenticator: Authenticator
    private let profiles: any ProfileRepository

    init(dependencies: AppDependencies) {
        session = dependencies.session
        authenticator = dependencies.authenticator
        profiles = dependencies.profiles
    }

    var sessionState: Session.State { session.state }

    func route() async {
        guard session.state == .signedIn else {
            destination = .signedOut
            return
        }
        destination = .checking
        do {
            guard let user = try await authenticator.validateSession() else {
                destination = .signedOut
                return
            }
            let profile = try await profiles.profile()
            destination = profile?.onboardingCompleted == true ? .home : .onboarding(suggestedName: user.name)
        } catch is CancellationError {
            return
        } catch {
            // Offline at launch with a stored token opens the app rather than signing the user out; the screens
            // show their own offline state. A 401 has already ended the session.
            destination = session.state == .signedIn ? .home : .signedOut
        }
    }

    func onboardingFinished() {
        destination = .home
    }
}
