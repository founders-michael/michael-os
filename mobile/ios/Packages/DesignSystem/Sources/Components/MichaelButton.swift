import SwiftUI

public struct MichaelButton: View {
    public enum Style: Sendable {
        case primary, secondary, ghost, destructive
    }

    private let title: String
    private let style: Style
    private let action: () -> Void

    public init(_ title: String, style: Style = .primary, action: @escaping () -> Void) {
        self.title = title
        self.style = style
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Text(title)
        }
        .buttonStyle(MichaelButtonStyle(style: style))
    }
}

private struct MichaelButtonStyle: ButtonStyle {
    let style: MichaelButton.Style
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        return configuration.label
            .michaelText(.button)
            .multilineTextAlignment(.center)
            .foregroundStyle(foreground)
            .padding(.horizontal, style == .primary || style == .secondary ? MichaelSpace.lg : MichaelSpace.md)
            .frame(maxWidth: .infinity, minHeight: MichaelSize.button)
            .background(background, in: RoundedRectangle(cornerRadius: MichaelRadius.button))
            .overlay {
                if hasBorder {
                    RoundedRectangle(cornerRadius: MichaelRadius.button).strokeBorder(Color.michael.border2)
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: MichaelRadius.button))
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
        MichaelButton("Disabled", style: .secondary) {}.disabled(true)
    }
}
