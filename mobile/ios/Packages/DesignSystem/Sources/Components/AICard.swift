import SwiftUI

public struct AICard<Content: View>: View {
    private let content: Content
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        let shape = RoundedRectangle(cornerRadius: MichaelRadius.ai)
        content
            .padding(MichaelSpace.cardPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                ShadowedShape(shape: shape, fill: Color.michael.aiSurface, layers: MichaelEffects.aiShadow(scheme))
            }
            .overlay {
                TimelineView(.animation(paused: reduceMotion)) { context in
                    shape.strokeBorder(
                        AngularGradient(
                            colors: MichaelEffects.aiBorder(scheme).map(\.color),
                            center: .center,
                            angle: .degrees(reduceMotion ? 0 : flowAngle(at: context.date))
                        ),
                        lineWidth: 1
                    )
                }
            }
    }

    // The web drifts a linear gradient sideways; on a phone-sized card a conic gradient turning once per
    // period reads as the same drift along the border and loops without a seam.
    private func flowAngle(at date: Date) -> Double {
        let period = MichaelMotion.aiBorderFlow
        return date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: period) / period * 360
    }
}

#Preview {
    ThemePreview {
        AICard {
            HStack(alignment: .top, spacing: MichaelSpace.md) {
                MichaelOrb(size: .small)
                Text(verbatim: "Michael's surface.")
                    .michaelText(.label)
                    .foregroundStyle(Color.michael.text)
            }
        }
    }
}
