import SwiftUI

public struct MichaelCard<Content: View>: View {
    private let content: Content
    @Environment(\.colorScheme) private var scheme

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        let shape = RoundedRectangle(cornerRadius: MichaelRadius.card)
        content
            .padding(MichaelSpace.cardPadding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                ShadowedShape(shape: shape, fill: Color.michael.surface, layers: MichaelEffects.cardShadow(scheme))
            }
            .overlay { shape.strokeBorder(Color.michael.border) }
    }
}

#Preview {
    ThemePreview {
        MichaelCard {
            Text(verbatim: "Card")
                .michaelText(.body)
                .foregroundStyle(Color.michael.text)
        }
    }
}
