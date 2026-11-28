import SwiftUI

/// The user's choice of theme, kept on the device. Read at the app root and written in Settings.
public enum Appearance: String, CaseIterable, Sendable {
    case system, dark, light

    public static let storageKey = "appearance"

    public var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .dark: .dark
        case .light: .light
        }
    }
}
