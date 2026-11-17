import SwiftUI

public struct MichaelOrb: View {
    public enum Activity: Sendable {
        case idle, thinking
    }

    public enum Size: Sendable {
        case small, large

        var diameter: CGFloat {
            switch self {
            case .small: MichaelSize.orbSmall
            case .large: MichaelSize.orbLarge
            }
        }
    }

    private let activity: Activity
    private let size: Size
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // Scale ranges from ux-motion.md (breathe) and michael-theme.css (ring); they are shape, not timing.
    private let breatheScale = 0.045
    private let ringStart = 0.92
    private let ringEnd = 1.75
    private let ringOpacity = 0.55

    public init(activity: Activity = .idle, size: Size) {
        self.activity = activity
        self.size = size
    }

    public var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { context in
            let time = context.date.timeIntervalSinceReferenceDate
            ZStack {
                if activity == .thinking {
                    if reduceMotion {
                        ring(scale: (ringStart + ringEnd) / 2, opacity: ringOpacity / 2)
                    } else {
                        ring(at: time)
                        ring(at: time + MichaelMotion.orbRing / 2)
                    }
                }
                ShadowedShape(
                    shape: Circle(),
                    fill: RadialGradient(
                        stops: MichaelEffects.orb(scheme).map { Gradient.Stop(color: $0.color.color, location: $0.location) },
                        center: UnitPoint(x: 0.34, y: 0.28),
                        startRadius: 0,
                        // CSS sizes a circle gradient to the farthest corner: from (34%, 28%) that is 0.977 of the diameter.
                        endRadius: size.diameter * 0.977
                    ),
                    layers: MichaelEffects.orbShadow(scheme)
                )
                .scaleEffect(reduceMotion ? 1 : 1 + breatheScale * wave(at: time, period: breathePeriod))
            }
            .frame(width: size.diameter, height: size.diameter)
        }
        .accessibilityHidden(true)
    }

    private var breathePeriod: TimeInterval {
        activity == .thinking ? MichaelMotion.orbThinkingBreathe : MichaelMotion.orbBreathe(scheme)
    }

    private func ring(at time: TimeInterval) -> some View {
        let progress = time.truncatingRemainder(dividingBy: MichaelMotion.orbRing) / MichaelMotion.orbRing
        let eased = 1 - pow(1 - progress, 2)
        return ring(scale: ringStart + (ringEnd - ringStart) * eased, opacity: ringOpacity * (1 - eased))
    }

    private func ring(scale: Double, opacity: Double) -> some View {
        Circle()
            .strokeBorder(Color.michael.accent, lineWidth: 1)
            .scaleEffect(scale)
            .opacity(opacity)
    }

    private func wave(at time: TimeInterval, period: TimeInterval) -> Double {
        0.5 - 0.5 * cos(2 * .pi * time / period)
    }
}

#Preview {
    ThemePreview {
        HStack(spacing: MichaelSpace.xxl) {
            MichaelOrb(size: .small)
            MichaelOrb(size: .large)
            MichaelOrb(activity: .thinking, size: .large)
        }
        .padding(MichaelSpace.xl)
    }
}
