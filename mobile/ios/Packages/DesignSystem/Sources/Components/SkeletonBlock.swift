import SwiftUI

public struct SkeletonBlock: View {
    private let width: CGFloat?
    private let height: CGFloat
    private let cornerRadius: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(width: CGFloat? = nil, height: CGFloat, cornerRadius: CGFloat = MichaelRadius.buttonSmall) {
        self.width = width
        self.height = height
        self.cornerRadius = cornerRadius
    }

    public var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { context in
            RoundedRectangle(cornerRadius: cornerRadius)
                .fill(Color.michael.track)
                .opacity(reduceMotion ? 1 : pulse(at: context.date.timeIntervalSinceReferenceDate))
        }
        .frame(maxWidth: width ?? .infinity)
        .frame(width: width, height: height)
        .accessibilityHidden(true)
    }

    private func pulse(at time: TimeInterval) -> Double {
        let wave = 0.5 - 0.5 * cos(2 * .pi * time / MichaelMotion.skeletonPulse)
        return 1 - 0.55 * wave
    }
}

#Preview {
    ThemePreview {
        HStack(spacing: MichaelSpace.md) {
            SkeletonBlock(width: MichaelSize.check, height: MichaelSize.check, cornerRadius: MichaelRadius.pill)
            SkeletonBlock(height: MichaelSpace.lg)
            SkeletonBlock(width: 64, height: MichaelSize.chip, cornerRadius: MichaelRadius.pill)
        }
    }
}
