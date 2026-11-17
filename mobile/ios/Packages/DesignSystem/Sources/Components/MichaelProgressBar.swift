import SwiftUI

public struct MichaelProgressBar: View {
    private let value: Double
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(value: Double) {
        self.value = min(max(value, 0), 1)
    }

    public var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.michael.track)
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: MichaelEffects.progress(scheme).map(\.color),
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: proxy.size.width * value)
            }
        }
        .frame(height: MichaelSize.progressTrack)
        .animation(reduceMotion ? nil : .easeOut(duration: MichaelMotion.progress), value: value)
        .accessibilityRepresentation {
            ProgressView(value: value)
        }
    }
}

#Preview {
    ThemePreview {
        MichaelProgressBar(value: 0.43)
    }
}
