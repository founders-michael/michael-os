import DesignSystem
import SwiftUI

public struct HabitsPlaceholder: View {
    public init() {}

    public var body: some View {
        Text(String(localized: "habits.placeholder", bundle: .module))
            .michaelText(.title)
            .foregroundStyle(Color.michael.text)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MichaelBackground())
    }
}

#Preview {
    HabitsPlaceholder()
}
