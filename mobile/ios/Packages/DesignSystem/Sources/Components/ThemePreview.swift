import SwiftUI

struct ThemePreview<Content: View>: View {
    @ViewBuilder let content: () -> Content

    init(@ViewBuilder content: @escaping () -> Content) {
        MichaelFonts.register()
        self.content = content
    }

    var body: some View {
        VStack(spacing: 0) {
            panel.environment(\.colorScheme, .dark)
            panel.environment(\.colorScheme, .light)
        }
    }

    private var panel: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.md, content: content)
            .padding(MichaelSpace.screenGutter)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(MichaelBackground())
    }
}
