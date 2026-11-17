import DesignSystem
import SwiftUI

public struct OnboardingPlaceholder: View {
    public init() {}

    public var body: some View {
        Text(String(localized: "onboarding.placeholder", bundle: .module))
            .michaelText(.title)
            .foregroundStyle(Color.michael.text)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MichaelBackground())
    }
}

#Preview {
    OnboardingPlaceholder()
}
