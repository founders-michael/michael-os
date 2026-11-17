import SwiftUI

public struct MichaelChip: View {
    public enum Tone: Sendable {
        case plain, ai, warn, danger
    }

    private let text: String
    private let tone: Tone

    public init(_ text: String, tone: Tone = .plain) {
        self.text = text
        self.tone = tone
    }

    public var body: some View {
        Text(text)
            .michaelText(.caption)
            .foregroundStyle(foreground)
            .padding(.horizontal, MichaelSpace.md)
            .frame(minHeight: MichaelSize.chip)
            .background(background, in: Capsule())
            .overlay {
                if let border {
                    Capsule().strokeBorder(border)
                }
            }
    }

    private var foreground: Color {
        switch tone {
        case .plain: Color.michael.muted
        case .ai: Color.michael.atext
        case .warn: Color.michael.warn
        case .danger: Color.michael.danger
        }
    }

    private var background: Color {
        switch tone {
        case .plain: Color.michael.raise
        case .ai: Color.michael.chip
        case .warn: Color.michael.warnBg
        case .danger: Color.michael.dangerBg
        }
    }

    private var border: Color? {
        switch tone {
        case .plain: Color.michael.border
        case .ai: Color.michael.chipBorder
        case .warn, .danger: nil
        }
    }
}

#Preview {
    ThemePreview {
        HStack {
            MichaelChip("Today")
            MichaelChip("From Michael", tone: .ai)
        }
        HStack {
            MichaelChip("Due in 9 days", tone: .warn)
            MichaelChip("Overdue", tone: .danger)
        }
    }
}
