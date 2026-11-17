import SwiftUI

public struct StatTile: View {
    private let value: String
    private let label: String
    private let isHighlighted: Bool

    public init(value: String, label: String, isHighlighted: Bool = false) {
        self.value = value
        self.label = label
        self.isHighlighted = isHighlighted
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(value)
                .michaelText(.stat)
                .foregroundStyle(isHighlighted ? Color.michael.atext : Color.michael.text)
            Text(label)
                .michaelText(.caption)
                .foregroundStyle(Color.michael.muted)
        }
        .padding(MichaelSpace.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.michael.raise, in: RoundedRectangle(cornerRadius: MichaelRadius.stat))
        .overlay {
            RoundedRectangle(cornerRadius: MichaelRadius.stat).strokeBorder(Color.michael.border)
        }
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    ThemePreview {
        HStack {
            StatTile(value: "7", label: "Planned")
            StatTile(value: "5", label: "Completed", isHighlighted: true)
            StatTile(value: "2", label: "Missed")
        }
    }
}
