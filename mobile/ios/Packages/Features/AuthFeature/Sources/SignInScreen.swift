import DesignSystem
import Repositories
import SwiftUI

public struct SignInScreen: View {
    @State private var model: SignInModel
    @State private var email = ""
    @State private var password = ""
    private let onRegister: () -> Void
    private let onNeedsVerification: (String) -> Void

    public init(auth: any AuthRepository, onRegister: @escaping () -> Void, onNeedsVerification: @escaping (String) -> Void) {
        _model = State(initialValue: SignInModel(auth: auth))
        self.onRegister = onRegister
        self.onNeedsVerification = onNeedsVerification
    }

    public var body: some View {
        MichaelPage {
            AuthHeading(
                title: String(localized: "signIn.title", bundle: .module),
                message: String(localized: "signIn.message", bundle: .module)
            )
            VStack(spacing: MichaelSpace.lg) {
                if case .failed(let error) = model.state {
                    ErrorBanner(message: error.authMessage)
                }
                MichaelTextField(String(localized: "field.email", bundle: .module), text: $email)
                    .emailField()
                MichaelTextField(String(localized: "field.password", bundle: .module), text: $password, isSecure: true)
                    .textContentType(.password)
                    .onSubmit(submit)
                MichaelButton(
                    String(localized: model.state == .submitting ? "signIn.submitting" : "signIn.submit", bundle: .module),
                    action: submit
                )
                .disabled(!SignInModel.canSubmit(email: email, password: password) || model.state == .submitting)
            }
        } footer: {
            HStack(spacing: MichaelSpace.xs) {
                Text(String(localized: "signIn.newHere", bundle: .module))
                    .foregroundStyle(Color.michael.muted)
                Button(String(localized: "signIn.register", bundle: .module), action: onRegister)
                    .foregroundStyle(Color.michael.atext)
                    .frame(minHeight: MichaelSize.checkTouch)
            }
            .michaelText(.label)
            .frame(maxWidth: .infinity)
        }
        .onChange(of: model.state) { _, state in
            if case .needsVerification(let email) = state {
                onNeedsVerification(email)
                model.verificationShown()
            }
        }
    }

    private func submit() {
        guard SignInModel.canSubmit(email: email, password: password) else { return }
        _Concurrency.Task { await model.signIn(email: email, password: password) }
    }
}
