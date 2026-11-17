import DesignSystem
import MyDayFeature
import SwiftUI

struct RootView: View {
    let dependencies: AppDependencies

    var body: some View {
        #if DEBUG
            DebugRoot(dependencies: dependencies)
        #else
            MyDayPlaceholder()
        #endif
    }
}

#if DEBUG
    private struct DebugRoot: View {
        let dependencies: AppDependencies
        // Launch with `-debugTab api` to open on the API screen.
        @State private var tab = UserDefaults.standard.string(forKey: "debugTab") ?? "components"

        var body: some View {
            TabView(selection: $tab) {
                ComponentGallery()
                    .tabItem { Label(String(localized: "debug.tab.components"), systemImage: "square.grid.2x2") }
                    .tag("components")
                APIProbeScreen(dependencies: dependencies)
                    .tabItem { Label(String(localized: "debug.tab.api"), systemImage: "network") }
                    .tag("api")
            }
            .tint(Color.michael.accent)
        }
    }
#endif
