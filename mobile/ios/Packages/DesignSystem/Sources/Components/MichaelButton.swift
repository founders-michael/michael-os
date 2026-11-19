import SwiftUI

public struct MichaelButton: View {
    public enum Style: Sendable {
        case primary, secondary, ghost, destructive
    }

    /// Regular buttons fill the width; small ones fit their title, for actions inside a card or row.
    public enum Size: Sendable {
        case regular, small
    }

    private let title: String
    private let style: Style
    private let size: Size
    private let action: () -> Void

    public init(_ title: String, style: Style = .primary, size: Size = .regular, action: @escaping () -> Void) {
        self.title = title
        self.style = style
        self.size = size
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Text(title)
        }
        .buttonStyle(MichaelButtonStyle(style: style, size: size))
    }
}

private struct MichaelButtonStyle: ButtonStyle {
    let style: MichaelButton.Style
    let size: MichaelButton.Size
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        let small = size == .small
        let shape = RoundedRectangle(cornerRadius: small ? MichaelRadius.buttonSmall : MichaelRadius.button)
        return configuration.label
            .michaelText(.button)
            .multilineTextAlignment(.center)
            .foregroundStyle(foreground)
            .padding(.horizontal, style == .primary || style == .secondary ? MichaelSpace.lg : MichaelSpace.md)
            .frame(maxWidth: small ? nil : .infinity, minHeight: small ? MichaelSize.buttonSmall : MichaelSize.button)
            .background(background, in: shape)
            .overlay {
                if hasBorder {
                    shape.strokeBorder(Color.michael.border2)
                }
            }
            // A small button still takes a full-size touch target.
            .frame(minHeight: MichaelSize.checkTouch)
            .contentShape(Rectangle())
            .opacity(pressed ? 0.85 : 1)
            .scaleEffect(pressed && !reduceMotion ? 0.97 : 1)
            .animation(pressed ? .easeOut(duration: MichaelMotion.press) : .spring(), value: pressed)
    }

    private var foreground: Color {
        guard isEnabled else { return Color.michael.faint }
        switch style {
        case .primary: return Color.michael.onfill
        case .secondary: return Color.michael.text
        case .ghost: return Color.michael.muted
        case .destructive: return Color.michael.danger
        }
    }

    private var background: Color {
        guard isEnabled else { return .clear }
        switch style {
        case .primary: return Color.michael.fill
        case .secondary: return Color.michael.raise
        case .ghost, .destructive: return .clear
        }
    }

    private var hasBorder: Bool {
        !isEnabled || style == .secondary
    }
}

#Preview {
    ThemePreview {
        MichaelButton("Primary") {}
        MichaelButton("Secondary", style: .secondary) {}
        MichaelButton("Ghost", style: .ghost) {}
        MichaelButton("Destructive", style: .destructive) {}
        MichaelButton("Small", style: .secondary, size: .small) {}
        MichaelButton("Disabled", style: .secondary) {}.disabled(true)
    }
}
