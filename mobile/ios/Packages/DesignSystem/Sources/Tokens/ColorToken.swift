import SwiftUI
import UIKit

// Mirrors color.dark and color.light in mobile/design/tokens.json; TokenDriftTests fails if they differ.
enum ColorToken: String, CaseIterable, Sendable {
    case bg, side, surface, solid, raise, border, border2, text, muted, faint
    case accent, accent2, atext, fill, onfill, chip, chipBorder, warn, warnBg
    case danger, dangerBg, track, aiSurface, onAccent, info, infoBg

    var dark: RGBA {
        switch self {
        case .bg: RGBA(hex: 0x06080B)
        case .side: RGBA(10, 14, 19, 0.72)
        case .surface: RGBA(255, 255, 255, 0.028)
        case .solid: RGBA(hex: 0x0C1117)
        case .raise: RGBA(255, 255, 255, 0.05)
        case .border: RGBA(255, 255, 255, 0.08)
        case .border2: RGBA(255, 255, 255, 0.14)
        case .text: RGBA(hex: 0xECF2F5)
        case .muted: RGBA(hex: 0x9AA7B2)
        case .faint: RGBA(hex: 0x808D99)
        case .accent: RGBA(hex: 0x41F0B0)
        case .accent2: RGBA(hex: 0x5CD6FF)
        case .atext: RGBA(hex: 0x6AF5C4)
        case .fill: RGBA(hex: 0x41F0B0)
        case .onfill: RGBA(hex: 0x03140D)
        case .chip: RGBA(65, 240, 176, 0.10)
        case .chipBorder: RGBA(65, 240, 176, 0.28)
        case .warn: RGBA(hex: 0xFFC27A)
        case .warnBg: RGBA(255, 194, 122, 0.10)
        case .danger: RGBA(hex: 0xFF8A94)
        case .dangerBg: RGBA(255, 138, 148, 0.10)
        case .track: RGBA(255, 255, 255, 0.07)
        case .aiSurface: RGBA(hex: 0x0B1016)
        case .onAccent: RGBA(hex: 0x03140D)
        case .info: RGBA(hex: 0x8EDFFF)
        case .infoBg: RGBA(92, 214, 255, 0.10)
        }
    }

    var light: RGBA {
        switch self {
        case .bg: RGBA(hex: 0xF5F7FA)
        case .side: RGBA(hex: 0xFFFFFF)
        case .surface: RGBA(hex: 0xFFFFFF)
        case .solid: RGBA(hex: 0xFFFFFF)
        case .raise: RGBA(hex: 0xF2F5F8)
        case .border: RGBA(hex: 0xE3E8EE)
        case .border2: RGBA(hex: 0xD2D9E2)
        case .text: RGBA(hex: 0x0B1220)
        case .muted: RGBA(hex: 0x526071)
        case .faint: RGBA(hex: 0x5F6B7B)
        case .accent: RGBA(hex: 0x10B981)
        case .accent2: RGBA(hex: 0x3B82F6)
        case .atext: RGBA(hex: 0x047857)
        case .fill: RGBA(hex: 0x0B1220)
        case .onfill: RGBA(hex: 0xFFFFFF)
        case .chip: RGBA(hex: 0xECFDF5)
        case .chipBorder: RGBA(hex: 0xA7F3D0)
        case .warn: RGBA(hex: 0x9A5B00)
        case .warnBg: RGBA(hex: 0xFFF7E8)
        case .danger: RGBA(hex: 0xB42335)
        case .dangerBg: RGBA(hex: 0xFFF1F2)
        case .track: RGBA(hex: 0xE8EDF2)
        case .aiSurface: RGBA(hex: 0xFFFFFF)
        case .onAccent: RGBA(hex: 0x03140D)
        case .info: RGBA(hex: 0x1D4ED8)
        case .infoBg: RGBA(hex: 0xEFF6FF)
        }
    }
}

extension Color {
    init(token: ColorToken) {
        self.init(uiColor: Self.dynamic(dark: token.dark.uiColor, light: token.light.uiColor))
    }

    // SwiftUI resolves dynamic colours on its render thread when it draws asynchronously; a provider that inherits
    // this module's main-actor default traps there.
    nonisolated private static func dynamic(dark: UIColor, light: UIColor) -> UIColor {
        UIColor { $0.userInterfaceStyle == .dark ? dark : light }
    }
}
