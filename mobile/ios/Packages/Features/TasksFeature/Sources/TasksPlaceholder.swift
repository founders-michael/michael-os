import DesignSystem
import SwiftUI

public struct TasksPlaceholder: View {
    public init() {}

    public var body: some View {
        Text(String(localized: "tasks.placeholder", bundle: .module))
            .michaelText(.title)
            .foregroundStyle(Color.michael.text)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MichaelBackground())
    }
}

#Preview {
    TasksPlaceholder()
}
