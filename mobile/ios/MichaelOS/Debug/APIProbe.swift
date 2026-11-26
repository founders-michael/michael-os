#if DEBUG
    import Auth
    import DesignSystem
    import Models
    import Observation
    import Repositories
    import SwiftUI

    /// Signs in against the configured server with a typed-in account and lists task titles. Debug builds only;
    /// the real sign-in arrives in Phase 3.
    @MainActor
    @Observable
    final class APIProbeModel {
        enum State: Equatable {
            case signedOut(AppError?)
            case signingIn
            case loading
            case content([Models.Task])
            case empty
            case failed(AppError)
        }

        private(set) var state: State
        private let session: Session
        private let authenticator: Authenticator
        private let tasks: any TaskRepository
        @ObservationIgnored private var work: _Concurrency.Task<Void, Never>?

        init(dependencies: AppDependencies) {
            session = dependencies.session
            authenticator = dependencies.authenticator
            tasks = dependencies.tasks
            state = dependencies.session.state == .signedIn ? .loading : .signedOut(nil)
        }

        var isSignedIn: Bool { session.state == .signedIn }

        func refresh() async {
            guard isSignedIn else {
                if case .signedOut = state { return }
                state = .signedOut(nil)
                return
            }
            await load()
        }

        func signIn(email: String, password: String) {
            if state == .signingIn { return }
            state = .signingIn
            work = _Concurrency.Task {
                do {
                    _ = try await authenticator.signIn(email: email, password: password)
                } catch is CancellationError {
                    state = .signedOut(nil)
                } catch {
                    state = .signedOut(Self.appError(error))
                }
            }
        }

        func signOut() {
            work = _Concurrency.Task {
                await authenticator.signOut()
            }
        }

        func load() async {
            state = .loading
            do {
                let page = try await tasks.list(TaskQuery())
                state = page.tasks.isEmpty ? .empty : .content(page.tasks)
            } catch is CancellationError {
                return
            } catch {
                state = isSignedIn ? .failed(Self.appError(error)) : .signedOut(Self.appError(error))
            }
        }

        // Repositories throw only AppError and CancellationError; anything else is a bug worth seeing.
        private static func appError(_ error: any Error) -> AppError {
            guard let appError = error as? AppError else {
                assertionFailure("Unexpected error: \(error)")
                return .server(ServerMessage())
            }
            return appError
        }
    }

    struct APIProbeScreen: View {
        @State private var model: APIProbeModel
        @State private var email = ""
        @State private var password = ""

        init(dependencies: AppDependencies) {
            _model = State(initialValue: APIProbeModel(dependencies: dependencies))
        }

        var body: some View {
            ScrollView {
                VStack(alignment: .leading, spacing: MichaelSpace.lg) {
                    Text(String(localized: "debug.api.title"))
                        .michaelText(.title)
                        .foregroundStyle(Color.michael.text)
                        .accessibilityAddTraits(.isHeader)
                    content
                }
                .padding(MichaelSpace.screenGutter)
            }
            .background(MichaelBackground())
            .task(id: model.isSignedIn) { await model.refresh() }
        }

        @ViewBuilder private var content: some View {
            switch model.state {
            case .signedOut(let error):
                signInForm(error: error)
            case .signingIn, .loading:
                ProgressView().tint(Color.michael.accent).frame(maxWidth: .infinity)
            case .content(let tasks):
                MichaelCard {
                    VStack(alignment: .leading, spacing: MichaelSpace.md) {
                        ForEach(tasks) { task in
                            Text(task.title).michaelText(.body).foregroundStyle(Color.michael.text)
                        }
                    }
                }
                signedInActions
            case .empty:
                EmptyStateView(
                    title: String(localized: "debug.api.empty.title"),
                    message: String(localized: "debug.api.empty.message"),
                    actionTitle: String(localized: "debug.api.reload")
                ) { reload() }
                signedInActions
            case .failed(let error):
                FailureStateView(message: Self.message(for: error)) { reload() }
                signedInActions
            }
        }

        private func signInForm(error: AppError?) -> some View {
            VStack(alignment: .leading, spacing: MichaelSpace.md) {
                MichaelTextField(String(localized: "debug.api.email"), text: $email)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                MichaelTextField(String(localized: "debug.api.password"), text: $password, isSecure: true)
                    .textContentType(.password)
                if let error {
                    Text(Self.message(for: error)).michaelText(.label).foregroundStyle(Color.michael.danger)
                }
                MichaelButton(String(localized: "debug.api.signIn")) {
                    model.signIn(email: email, password: password)
                }
            }
        }

        private var signedInActions: some View {
            HStack(spacing: MichaelSpace.sm) {
                MichaelButton(String(localized: "debug.api.reload"), style: .secondary) { reload() }
                MichaelButton(String(localized: "debug.api.signOut"), style: .ghost) { model.signOut() }
            }
        }

        private func reload() {
            _Concurrency.Task { await model.load() }
        }

        private static func message(for error: AppError) -> String {
            switch error {
            case .offline: String(localized: "debug.api.error.offline")
            case .timeout: String(localized: "debug.api.error.timeout")
            case .decoding: String(localized: "debug.api.error.generic")
            case .unauthorized(let server), .forbidden(let server), .notFound(let server), .conflict(let server),
                .server(let server), .validation(let server, _), .rateLimited(let server, _):
                server.text ?? String(localized: "debug.api.error.generic")
            }
        }
    }
#endif
