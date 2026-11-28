import DesignSystem
import SwiftUI

@main
struct MichaelOSApp: App {
    private let dependencies: AppDependencies
    @AppStorage(Appearance.storageKey) private var appearance = Appearance.system

    init() {
        MichaelFonts.register()
        dependencies = AppDependencies.live()
    }

    var body: some Scene {
        WindowGroup {
            RootView(dependencies: dependencies)
                .preferredColorScheme(appearance.colorScheme)
        }
    }
}
