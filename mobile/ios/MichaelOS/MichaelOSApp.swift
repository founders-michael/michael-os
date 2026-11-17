import DesignSystem
import SwiftUI

@main
struct MichaelOSApp: App {
    private let dependencies: AppDependencies

    init() {
        MichaelFonts.register()
        dependencies = AppDependencies.live()
    }

    var body: some Scene {
        WindowGroup {
            RootView(dependencies: dependencies)
        }
    }
}
