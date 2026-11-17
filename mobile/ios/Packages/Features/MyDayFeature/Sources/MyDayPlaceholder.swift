import DesignSystem
import SwiftUI

public struct MyDayPlaceholder: View {
    public init() {}

    public var body: some View {
        Text(String(localized: "myDay.placeholder", bundle: .module))
            .michaelText(.title)
            .foregroundStyle(Color.michael.text)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(MichaelBackground())
    }
}

#Preview {
    MyDayPlaceholder()
}
