import DesignSystem
import Repositories
import SwiftUI

public struct CheckEmailScreen: View {
    @State private var model: CheckEmailModel
    @Environment(\.openURL) private var openURL
    private let onSignIn: () -> Void

    public init(email: String, auth: any AuthRepository, onSignIn: @escaping () -> Void) {
        _model = State(initialValue: CheckEmailModel(email: email, auth: auth))
        self.onSignIn = onSignIn
    }

    public var body: some View {
        MichaelPage {
            VStack(alignment: .leading, spacing: MichaelSpace.lg) {
                Image(systemName: "envelope.badge")
                    .font(.system(size: MichaelSize.orbSmall))
                    .foregroundStyle(Color.michael.atext)
                    .accessibilityHidden(true)
                AuthHeading(
                    title: String(localized: "checkEmail.title", bundle: .module),
                    message: String(localized: "checkEmail.sentTo", bundle: .module)
                )
                Text(model.email)
                    .michaelText(.heading)
                    .foregroundStyle(Color.michael.text)
                Text(String(localized: "checkEmail.message", bundle: .module))
                    .michaelText(.body)
                    .foregroundStyle(Color.michael.muted)
                if case .failed(let error) = model.state {
                    ErrorBanner(message: error.authMessage)
                }
            }
        } footer: {
            VStack(spacing: MichaelSpace.sm) {
                MichaelButton(String(localized: "checkEmail.openMail", bundle: .module)) {
                    if let mail = URL(string: "message://") { openURL(mail) }
                }
                MichaelButton(String(localized: "checkEmail.signIn", bundle: .module), style: .secondary, action: onSignIn)
                MichaelButton(resendTitle, style: .ghost) {
                    _Concurrency.Task { await model.resend() }
                }
                .disabled(model.isCoolingDown || model.state == .sending)
            }
        }
        .task(id: model.isCoolingDown) { await model.countDown() }
    }

    private var resendTitle: String {
        switch model.state {
        case .coolingDown(let seconds):
            String(localized: "checkEmail.resendIn \(Duration.seconds(seconds).formatted(.time(pattern: .minuteSecond)))", bundle: .module)
        case .sending: String(localized: "checkEmail.sending", bundle: .module)
        case .ready, .failed: String(localized: "checkEmail.resend", bundle: .module)
        }
    }
}
