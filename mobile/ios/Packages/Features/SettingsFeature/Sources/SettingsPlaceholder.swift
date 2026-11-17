import DesignSystem
import SwiftUI

public struct SettingsPlaceholder: View {
    public init() {}

    public var body: some View {
        Text(String(localized: "settings.placeholder", bundle: .module))
            .michaelText(.title)
            .foregroundStyle(Color.michael.text)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MichaelBackground())
    }
}

#Preview {
    SettingsPlaceholder()
}
