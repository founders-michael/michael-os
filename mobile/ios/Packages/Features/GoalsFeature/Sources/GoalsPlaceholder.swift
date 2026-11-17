import DesignSystem
import SwiftUI

public struct GoalsPlaceholder: View {
    public init() {}

    public var body: some View {
        Text(String(localized: "goals.placeholder", bundle: .module))
            .michaelText(.title)
            .foregroundStyle(Color.michael.text)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MichaelBackground())
    }
}

#Preview {
    GoalsPlaceholder()
}
