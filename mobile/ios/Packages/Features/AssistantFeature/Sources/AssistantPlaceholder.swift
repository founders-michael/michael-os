import DesignSystem
import SwiftUI

public struct AssistantPlaceholder: View {
    public init() {}

    public var body: some View {
        Text(String(localized: "assistant.placeholder", bundle: .module))
            .michaelText(.title)
            .foregroundStyle(Color.michael.text)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MichaelBackground())
    }
}

#Preview {
    AssistantPlaceholder()
}
