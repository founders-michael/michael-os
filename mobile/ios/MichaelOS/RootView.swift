import AuthFeature
import DesignSystem
import MyDayFeature
import OnboardingFeature
import SwiftUI

struct RootView: View {
    let dependencies: AppDependencies

    var body: some View {
        #if DEBUG
            // Launch with `-debugTab components` or `-debugTab api` for the debug screens.
            if UserDefaults.standard.string(forKey: "debugTab") != nil {
                DebugRoot(dependencies: dependencies)
            } else {
                AppRoot(dependencies: dependencies)
            }
        #else
            AppRoot(dependencies: dependencies)
        #endif
    }
}

private struct AppRoot: View {
    let dependencies: AppDependencies
    @State private var launch: LaunchModel
    @State private var authPath: [AuthRoute] = []

    init(dependencies: AppDependencies) {
        self.dependencies = dependencies
        _launch = State(initialValue: LaunchModel(dependencies: dependencies))
    }

    var body: some View {
        content
            .task(id: launch.sessionState) {
                authPath = []
                await launch.route()
            }
    }

    @ViewBuilder private var content: some View {
        switch launch.destination {
        case .checking:
            ProgressView()
                .tint(Color.michael.accent)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(MichaelBackground())
        case .signedOut:
            NavigationStack(path: $authPath) {
                WelcomeScreen(
                    termsURL: dependencies.termsURL,
                    privacyURL: dependencies.privacyURL,
                    onSignIn: { authPath.append(.signIn) },
                    onRegister: { authPath.append(.register) }
                )
                .navigationDestination(for: AuthRoute.self, destination: screen)
            }
            .tint(Color.michael.muted)
        case .onboarding(let suggestedName):
            OnboardingScreen(
                profiles: dependencies.profiles,
                suggestedName: suggestedName,
                deviceTimeZone: TimeZone.current.identifier,
                onFinished: launch.onboardingFinished
            )
        case .home:
            MyDayPlaceholder {
                _Concurrency.Task { await dependencies.auth.signOut() }
            }
        }
    }

    @ViewBuilder private func screen(_ route: AuthRoute) -> some View {
        switch route {
        case .signIn:
            SignInScreen(
                auth: dependencies.auth,
                onRegister: { authPath.append(.register) },
                onNeedsVerification: { authPath.append(.checkEmail(email: $0)) }
            )
            .toolbarBackground(.hidden, for: .navigationBar)
        case .register:
            RegisterScreen(
                auth: dependencies.auth,
                termsURL: dependencies.termsURL,
                privacyURL: dependencies.privacyURL,
                onRegistered: { authPath.append(.checkEmail(email: $0)) }
            )
            .toolbarBackground(.hidden, for: .navigationBar)
        case .checkEmail(let email):
            CheckEmailScreen(email: email, auth: dependencies.auth) {
                authPath = [.signIn]
            }
            .toolbarBackground(.hidden, for: .navigationBar)
        }
    }
}

#if DEBUG
    private struct DebugRoot: View {
        let dependencies: AppDependencies
        @State private var tab = UserDefaults.standard.string(forKey: "debugTab") ?? "components"

        var body: some View {
            TabView(selection: $tab) {
                ComponentGallery()
                    .tabItem { Label(String(localized: "debug.tab.components"), systemImage: "square.grid.2x2") }
                    .tag("components")
                APIProbeScreen(dependencies: dependencies)
                    .tabItem { Label(String(localized: "debug.tab.api"), systemImage: "network") }
                    .tag("api")
            }
            .tint(Color.michael.accent)
        }
    }
#endif
