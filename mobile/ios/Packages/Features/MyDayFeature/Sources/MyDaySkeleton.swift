import DesignSystem
import SwiftUI

/// The day's layout with blocks where the text will be, so the content replaces it without a jump.
struct MyDaySkeleton: View {
    // Fractions of the width, so the blocks read as lines of different lengths.
    private let titleWidths: [CGFloat] = [0.7, 0.55, 0.62]

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width - 2 * MichaelSpace.screenGutter
            VStack(alignment: .leading, spacing: MichaelSpace.lg) {
                VStack(alignment: .leading, spacing: MichaelSpace.sm) {
                    SkeletonBlock(width: width * 0.4, height: MichaelSpace.md)
                    SkeletonBlock(width: width * 0.8, height: MichaelSpace.xxl)
                    SkeletonBlock(width: width * 0.9, height: MichaelSpace.lg)
                }
                SkeletonBlock(height: MichaelSize.button * 2, cornerRadius: MichaelRadius.card)
                SkeletonBlock(height: MichaelSize.button * 1.5, cornerRadius: MichaelRadius.card)
                SkeletonBlock(width: width * 0.3, height: MichaelSpace.lg)
                ForEach(titleWidths.indices, id: \.self) { index in
                    row(titleWidth: width * titleWidths[index])
                }
                SkeletonBlock(width: width * 0.3, height: MichaelSpace.lg)
                row(titleWidth: width * 0.5)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, MichaelSpace.screenGutter)
            .padding(.vertical, MichaelSpace.lg)
        }
        .accessibilityElement()
        .accessibilityLabel(String(localized: "myDay.loading", bundle: .module))
        .accessibilityAddTraits(.updatesFrequently)
    }

    private func row(titleWidth: CGFloat) -> some View {
        HStack(spacing: MichaelSpace.md) {
            SkeletonBlock(width: MichaelSize.check, height: MichaelSize.check, cornerRadius: MichaelRadius.pill)
            SkeletonBlock(width: titleWidth, height: MichaelSpace.lg)
            Spacer(minLength: 0)
        }
        .frame(minHeight: MichaelSize.checkTouch)
    }
}
