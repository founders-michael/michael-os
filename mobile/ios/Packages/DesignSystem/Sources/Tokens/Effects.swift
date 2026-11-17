import SwiftUI

struct ColorStop: Equatable, Sendable {
    let color: RGBA
    let location: Double
}

struct ShadowLayer: Equatable, Sendable {
    let x: CGFloat
    let y: CGFloat
    let blur: CGFloat
    let color: RGBA
}

struct RadialGlow: Equatable, Sendable {
    let width: CGFloat
    let height: CGFloat
    let centerX: Double
    let centerY: Double
    let color: RGBA
    let fadeEnd: Double
}

struct DotGrid: Equatable, Sendable {
    let spacing: CGFloat
    let color: RGBA
    let radius: CGFloat
}

// Mirrors gradient and shadow in mobile/design/tokens.json; TokenDriftTests fails if they differ.
enum MichaelEffects {
    static let orb = Themed(
        dark: [
            ColorStop(color: RGBA(hex: 0xE6FFF5), location: 0),
            ColorStop(color: RGBA(hex: 0x7DFAD0), location: 0.16),
            ColorStop(color: RGBA(hex: 0x41F0B0), location: 0.34),
            ColorStop(color: RGBA(hex: 0x0F9E76), location: 0.58),
            ColorStop(color: RGBA(hex: 0x04261D), location: 0.86),
        ],
        light: [
            ColorStop(color: RGBA(hex: 0xFFFFFF), location: 0),
            ColorStop(color: RGBA(hex: 0xC9F7E4), location: 0.22),
            ColorStop(color: RGBA(hex: 0x34D399), location: 0.52),
            ColorStop(color: RGBA(hex: 0x047857), location: 0.92),
        ]
    )

    static let aiBorder = Themed(
        dark: [
            RGBA(65, 240, 176, 0.75), RGBA(92, 214, 255, 0.25), RGBA(255, 255, 255, 0.06),
            RGBA(92, 214, 255, 0.25), RGBA(65, 240, 176, 0.75),
        ],
        light: [RGBA(hex: 0x6EE7B7), RGBA(hex: 0xBFDBFE), RGBA(hex: 0xE3E8EE), RGBA(hex: 0x6EE7B7)]
    )

    static let progress = Themed(
        dark: [RGBA(hex: 0x41F0B0), RGBA(hex: 0x5CD6FF)],
        light: [RGBA(hex: 0x10B981), RGBA(hex: 0x3B82F6)]
    )

    static let pageGlows = Themed(
        dark: [
            RadialGlow(width: 1100, height: 520, centerX: 0.72, centerY: -0.12, color: RGBA(65, 240, 176, 0.13), fadeEnd: 0.6),
            RadialGlow(width: 800, height: 460, centerX: 0.08, centerY: -0.06, color: RGBA(92, 214, 255, 0.08), fadeEnd: 0.6),
        ],
        light: []
    )

    static let pageDots = Themed<DotGrid?>(
        dark: DotGrid(spacing: 22, color: RGBA(255, 255, 255, 0.035), radius: 1),
        light: nil
    )

    static let cardShadow = Themed(
        dark: [],
        light: [
            ShadowLayer(x: 0, y: 1, blur: 2, color: RGBA(16, 24, 40, 0.04)),
            ShadowLayer(x: 0, y: 4, blur: 14, color: RGBA(16, 24, 40, 0.05)),
        ]
    )

    static let orbShadow = Themed(
        dark: [ShadowLayer(x: 0, y: 0, blur: 22, color: RGBA(65, 240, 176, 0.5))],
        light: [ShadowLayer(x: 0, y: 8, blur: 20, color: RGBA(16, 185, 129, 0.28))]
    )

    static let aiShadow = Themed(
        dark: [ShadowLayer(x: 0, y: 0, blur: 50, color: RGBA(65, 240, 176, 0.07))],
        light: [
            ShadowLayer(x: 0, y: 1, blur: 2, color: RGBA(16, 24, 40, 0.04)),
            ShadowLayer(x: 0, y: 8, blur: 24, color: RGBA(16, 185, 129, 0.08)),
        ]
    )
}

// One copy of the shape per shadow layer, so the shadow is cast by the shape and never by the content on top of it.
struct ShadowedShape<S: Shape, Fill: ShapeStyle>: View {
    let shape: S
    let fill: Fill
    let layers: [ShadowLayer]

    var body: some View {
        ZStack {
            ForEach(Array(layers.enumerated()), id: \.offset) { _, layer in
                shape.fill(fill)
                    // CSS blur is twice SwiftUI's shadow radius.
                    .shadow(color: layer.color.color, radius: layer.blur / 2, x: layer.x, y: layer.y)
            }
            shape.fill(fill)
        }
    }
}
