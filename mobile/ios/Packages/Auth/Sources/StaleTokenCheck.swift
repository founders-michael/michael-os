import Foundation
import os

/// The Keychain outlives the app: an item written before an uninstall is still there after a reinstall, so a
/// reinstalled app would start signed in to the old session. `UserDefaults` is deleted with the app, so a missing
/// marker means this is the first launch of this installation, and any token found is stale.
public enum StaleTokenCheck {
    static let markerKey = "com.michaelos.app.installed"

    /// Call once at launch, before the session reads the store.
    public static func run(store: any TokenStore, defaults: UserDefaults) {
        guard !defaults.bool(forKey: markerKey) else { return }
        do {
            try store.delete()
            defaults.set(true, forKey: markerKey)
        } catch {
            // Leaving the marker unset retries on the next launch.
            Logger(subsystem: "com.michaelos.app", category: "session")
                .error("Removing a token left by an earlier install failed: \(String(describing: error), privacy: .public)")
        }
    }
}
