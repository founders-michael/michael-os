import DesignSystem
import SwiftUI

@main
struct MichaelOSApp: App {
    init() {
        MichaelFonts.register()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
