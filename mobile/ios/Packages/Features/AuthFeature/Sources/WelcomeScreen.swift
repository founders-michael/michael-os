import DesignSystem
import SwiftUI

public struct WelcomeScreen: View {
    private let termsURL: URL
    private let privacyURL: URL
    private let onSignIn: () -> Void
    private let onRegister: () -> Void

    public init(termsURL: URL, privacyURL: URL, onSignIn: @escaping () -> Void, onRegister: @escaping () -> Void) {
        self.termsURL = termsURL
        self.privacyURL = privacyURL
        self.onSignIn = onSignIn
        self.onRegister = onRegister
    }

    public var body: some View {
        MichaelPage {
            VStack(spacing: MichaelSpace.xl) {
                ZStack {
                    Circle()
                        .strokeBorder(Color.michael.chipBorder)
                        .opacity(0.5)
                    Circle()
                        .strokeBorder(Color.michael.chipBorder)
                        .padding(MichaelSpace.xl)
                    MichaelOrb(size: .large)
                }
                .frame(width: MichaelSize.orbLarge * 1.75, height: MichaelSize.orbLarge * 1.75)
                .accessibilityHidden(true)
                VStack(spacing: MichaelSpace.md) {
                    Text(String(localized: "welcome.title", bundle: .module))
                        .michaelText(.display)
                        .foregroundStyle(Color.michael.text)
                        .accessibilityAddTraits(.isHeader)
                    Text(String(localized: "welcome.message", bundle: .module))
                        .michaelText(.body)
                        .foregroundStyle(Color.michael.muted)
                }
                .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, MichaelSpace.xxl)
        } footer: {
            VStack(spacing: MichaelSpace.sm) {
                MichaelButton(String(localized: "welcome.signIn", bundle: .module), action: onSignIn)
                MichaelButton(String(localized: "welcome.register", bundle: .module), style: .ghost, action: onRegister)
                LegalLine(key: "welcome.legal %@ %@", termsURL: termsURL, privacyURL: privacyURL)
            }
        }
    }
}
