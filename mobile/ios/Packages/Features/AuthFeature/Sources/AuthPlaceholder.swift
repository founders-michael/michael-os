import DesignSystem
import SwiftUI

public struct AuthPlaceholder: View {
    public init() {}

    public var body: some View {
        Text(String(localized: "auth.placeholder", bundle: .module))
            .michaelText(.title)
            .foregroundStyle(Color.michael.text)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MichaelBackground())
    }
}

#Preview {
    AuthPlaceholder()
}
