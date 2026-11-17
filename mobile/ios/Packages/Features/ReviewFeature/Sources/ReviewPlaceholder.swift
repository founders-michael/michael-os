import DesignSystem
import SwiftUI

public struct ReviewPlaceholder: View {
    public init() {}

    public var body: some View {
        Text(String(localized: "review.placeholder", bundle: .module))
            .michaelText(.title)
            .foregroundStyle(Color.michael.text)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MichaelBackground())
    }
}

#Preview {
    ReviewPlaceholder()
}
