import SwiftUI

/// A full screen of content with its actions at the bottom. When everything fits, the actions sit at the foot of
/// the screen; at large text sizes the whole page scrolls and the actions follow the content.
public struct MichaelPage<Content: View, Footer: View>: View {
    private let content: Content
    private let footer: Footer

    public init(@ViewBuilder content: () -> Content, @ViewBuilder footer: () -> Footer) {
        self.content = content()
        self.footer = footer()
    }

    public var body: some View {
        GeometryReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: MichaelSpace.xl) {
                    content
                    Spacer(minLength: 0)
                    footer
                }
                .padding(.horizontal, MichaelSpace.screenGutter)
                .padding(.vertical, MichaelSpace.lg)
                .frame(maxWidth: .infinity, minHeight: proxy.size.height, alignment: .top)
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollDismissesKeyboard(.interactively)
        }
        .background(MichaelBackground())
    }
}
