import DesignSystem
import Repositories
import SwiftUI

public struct RegisterScreen: View {
    @State private var model: RegisterModel
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    private let termsURL: URL
    private let privacyURL: URL
    private let onRegistered: (String) -> Void

    public init(auth: any AuthRepository, termsURL: URL, privacyURL: URL, onRegistered: @escaping (String) -> Void) {
        _model = State(initialValue: RegisterModel(auth: auth))
        self.termsURL = termsURL
        self.privacyURL = privacyURL
        self.onRegistered = onRegistered
    }

    public var body: some View {
        MichaelPage {
            AuthHeading(
                title: String(localized: "register.title", bundle: .module),
                message: String(localized: "register.message", bundle: .module)
            )
            VStack(spacing: MichaelSpace.lg) {
                if case .failed(let error) = model.state {
                    ErrorBanner(message: error.authMessage)
                }
                MichaelTextField(String(localized: "field.name", bundle: .module), text: $name)
                    .textContentType(.name)
                MichaelTextField(String(localized: "field.email", bundle: .module), text: $email)
                    .emailField()
                VStack(alignment: .leading, spacing: MichaelSpace.sm) {
                    MichaelTextField(String(localized: "field.password", bundle: .module), text: $password, isSecure: true)
                        .textContentType(.newPassword)
                    PasswordRuleList(rules: PasswordRules(password))
                }
                MichaelButton(
                    String(localized: model.state == .submitting ? "register.submitting" : "register.submit", bundle: .module),
                    action: submit
                )
                .disabled(!RegisterModel.canSubmit(name: name, email: email, password: password) || model.state == .submitting)
            }
        } footer: {
            LegalLine(key: "register.legal %@ %@", termsURL: termsURL, privacyURL: privacyURL)
        }
        .onChange(of: model.state) { _, state in
            if case .registered(let email) = state {
                onRegistered(email)
                model.confirmationShown()
            }
        }
    }

    private func submit() {
        _Concurrency.Task { await model.register(name: name, email: email, password: password) }
    }
}

private struct PasswordRuleList: View {
    let rules: PasswordRules

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            row(
                rules.hasLength,
                String(localized: "register.rule.length \(PasswordRules.minimumLength) \(rules.length)", bundle: .module)
            )
            row(rules.hasUppercase, String(localized: "register.rule.uppercase", bundle: .module))
            row(rules.hasLowercase, String(localized: "register.rule.lowercase", bundle: .module))
        }
    }

    private func row(_ met: Bool, _ text: String) -> some View {
        HStack(spacing: MichaelSpace.sm) {
            Image(systemName: met ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(met ? Color.michael.accent : Color.michael.faint)
                .accessibilityHidden(true)
            Text(text)
                .michaelText(.caption)
                .foregroundStyle(met ? Color.michael.text : Color.michael.muted)
        }
        .accessibilityElement(children: .combine)
        .accessibilityValue(String(localized: met ? "register.rule.met" : "register.rule.notMet", bundle: .module))
    }
}
