import SwiftUI

public struct MichaelTextField: View {
    private let label: String
    @Binding private var text: String
    private let error: String?
    private let isSecure: Bool
    @FocusState private var isFocused: Bool

    public init(_ label: String, text: Binding<String>, error: String? = nil, isSecure: Bool = false) {
        self.label = label
        _text = text
        self.error = error
        self.isSecure = isSecure
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            Text(label)
                .michaelText(.label)
                .foregroundStyle(error == nil ? Color.michael.muted : Color.michael.danger)
                .accessibilityHidden(true)
            field
                .michaelText(.body)
                .foregroundStyle(Color.michael.text)
                .tint(Color.michael.accent)
                .focused($isFocused)
                .padding(.horizontal, MichaelSpace.md)
                .frame(minHeight: MichaelSize.field)
                .background(Color.michael.solid, in: RoundedRectangle(cornerRadius: MichaelRadius.field))
                .overlay {
                    RoundedRectangle(cornerRadius: MichaelRadius.field).strokeBorder(borderColor)
                }
                .accessibilityLabel(label)
                .accessibilityHint(error ?? "")
            if let error {
                Text(error)
                    .michaelText(.caption)
                    .foregroundStyle(Color.michael.danger)
                    .accessibilityHidden(true)
            }
        }
    }

    @ViewBuilder private var field: some View {
        if isSecure {
            SecureField("", text: $text)
        } else {
            TextField("", text: $text)
        }
    }

    private var borderColor: Color {
        if error != nil { return Color.michael.danger }
        return isFocused ? Color.michael.accent : Color.michael.border2
    }
}

#Preview {
    @Previewable @State var text = "Send the investor update"
    @Previewable @State var minutes = "2"
    ThemePreview {
        MichaelTextField("Field", text: $text)
        MichaelTextField("Estimate, minutes", text: $minutes, error: "Use at least 5 minutes, or leave it empty.")
    }
}
