import SwiftUI

public struct MichaelBackground: View {
    @Environment(\.colorScheme) private var scheme

    public init() {}

    public var body: some View {
        let glows = MichaelEffects.pageGlows(scheme)
        let dots = MichaelEffects.pageDots(scheme)
        Canvas { context, size in
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color.michael.bg))
            for glow in glows {
                draw(glow, in: &context, size: size)
            }
            if let dots {
                draw(dots, in: &context, size: size)
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }

    // A CSS radial-gradient with an explicit width and height is an ellipse; draw a circle and squash it.
    private func draw(_ glow: RadialGlow, in context: inout GraphicsContext, size: CGSize) {
        var layer = context
        layer.translateBy(x: size.width * glow.centerX, y: size.height * glow.centerY)
        layer.scaleBy(x: 1, y: glow.height / glow.width)
        let radius = glow.width
        layer.fill(
            Path(ellipseIn: CGRect(x: -radius, y: -radius, width: radius * 2, height: radius * 2)),
            with: .radialGradient(
                Gradient(stops: [
                    .init(color: glow.color.color, location: 0),
                    .init(color: glow.color.color.opacity(0), location: glow.fadeEnd),
                ]),
                center: .zero,
                startRadius: 0,
                endRadius: radius
            )
        )
    }

    private func draw(_ grid: DotGrid, in context: inout GraphicsContext, size: CGSize) {
        var path = Path()
        var y = grid.spacing / 2
        while y < size.height {
            var x = grid.spacing / 2
            while x < size.width {
                path.addEllipse(in: CGRect(x: x - grid.radius, y: y - grid.radius, width: grid.radius * 2, height: grid.radius * 2))
                x += grid.spacing
            }
            y += grid.spacing
        }
        context.fill(path, with: .color(grid.color.color))
    }
}

#Preview {
    ThemePreview {
        Color.clear.frame(height: 200)
    }
}
