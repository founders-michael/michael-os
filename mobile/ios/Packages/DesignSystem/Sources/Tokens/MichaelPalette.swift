import SwiftUI

public struct MichaelPalette: Sendable {
    public let bg = Color(token: .bg)
    public let side = Color(token: .side)
    public let surface = Color(token: .surface)
    public let solid = Color(token: .solid)
    public let raise = Color(token: .raise)
    public let border = Color(token: .border)
    public let border2 = Color(token: .border2)
    public let text = Color(token: .text)
    public let muted = Color(token: .muted)
    public let faint = Color(token: .faint)
    public let accent = Color(token: .accent)
    public let accent2 = Color(token: .accent2)
    public let atext = Color(token: .atext)
    public let fill = Color(token: .fill)
    public let onfill = Color(token: .onfill)
    public let chip = Color(token: .chip)
    public let chipBorder = Color(token: .chipBorder)
    public let warn = Color(token: .warn)
    public let warnBg = Color(token: .warnBg)
    public let danger = Color(token: .danger)
    public let dangerBg = Color(token: .dangerBg)
    public let track = Color(token: .track)
    public let aiSurface = Color(token: .aiSurface)
    public let onAccent = Color(token: .onAccent)
    public let info = Color(token: .info)
    public let infoBg = Color(token: .infoBg)
}

extension Color {
    public static let michael = MichaelPalette()
}
