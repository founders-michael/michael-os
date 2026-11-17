import DesignSystem
import SwiftUI

/// Stands in for My Day until Phase 4. Sign out lives here for now so the auth flow can be walked end to end.
public struct MyDayPlaceholder: View {
    private let onSignOut: () -> Void

    public init(onSignOut: @escaping () -> Void) {
        self.onSignOut = onSignOut
    }

    public var body: some View {
        MichaelPage {
            Text(String(localized: "myDay.placeholder", bundle: .module))
                .michaelText(.title)
                .foregroundStyle(Color.michael.text)
                .frame(maxWidth: .infinity)
                .padding(.top, MichaelSpace.xxl)
        } footer: {
            MichaelButton(String(localized: "myDay.signOut", bundle: .module), style: .secondary, action: onSignOut)
        }
    }
}

#Preview {
    MyDayPlaceholder {}
}
