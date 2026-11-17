import SwiftUI

public struct TypingDots: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // Dot size, gap, rise and stagger from the MichaelWorking mock.
    private let dot: CGFloat = 6
    private let gap: CGFloat = 2
    private let rise: CGFloat = 3
    private let stagger: TimeInterval = 0.15

    public init() {}

    public var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { context in
            let time = context.date.timeIntervalSinceReferenceDate
            HStack(spacing: gap) {
                ForEach(0..<3, id: \.self) { index in
                    let lift = reduceMotion ? 0.5 : bounce(at: time - Double(index) * stagger)
                    Circle()
                        .fill(Color.michael.accent)
                        .frame(width: dot, height: dot)
                        .opacity(0.25 + 0.75 * lift)
                        .offset(y: -rise * lift)
                }
            }
        }
        .frame(height: dot + rise)
        .accessibilityHidden(true)
    }

    // Rises over the first 40% of the period, falls by 80%, then rests.
    private func bounce(at time: TimeInterval) -> Double {
        let period = MichaelMotion.typingDot
        let phase = (time.truncatingRemainder(dividingBy: period) + period).truncatingRemainder(dividingBy: period) / period
        let linear: Double =
            switch phase {
            case ..<0.4: phase / 0.4
            case ..<0.8: 1 - (phase - 0.4) / 0.4
            default: 0
            }
        return 0.5 - 0.5 * cos(.pi * linear)
    }
}

#Preview {
    ThemePreview {
        TypingDots()
    }
}
