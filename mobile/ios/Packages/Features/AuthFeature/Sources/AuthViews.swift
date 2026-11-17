import DesignSystem
import SwiftUI

struct AuthHeading: View {
    let title: String
    let message: String

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.sm) {
            Text(title)
                .michaelText(.display)
                .foregroundStyle(Color.michael.text)
                .accessibilityAddTraits(.isHeader)
            Text(message)
                .michaelText(.body)
                .foregroundStyle(Color.michael.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// "By continuing you agree to the Terms of Service and Privacy Policy", with both as links.
struct LegalLine: View {
    let key: String.LocalizationValue
    let termsURL: URL
    let privacyURL: URL

    var body: some View {
        Text(markdown)
            .michaelText(.caption)
            .foregroundStyle(Color.michael.muted)
            .tint(Color.michael.atext)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
    }

    private var markdown: AttributedString {
        let format = String(localized: key, bundle: .module)
        let text = String(format: format, termsURL.absoluteString, privacyURL.absoluteString)
        return (try? AttributedString(markdown: text)) ?? AttributedString(text)
    }
}

extension View {
    func emailField() -> some View {
        textContentType(.username)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
    }
}
