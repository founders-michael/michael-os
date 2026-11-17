import SwiftUI

public struct MichaelSegmentedControl<Value: Hashable>: View {
    @Binding private var selection: Value
    private let options: [Value]
    private let title: (Value) -> String
    @Environment(\.colorScheme) private var scheme

    public init(selection: Binding<Value>, options: [Value], title: @escaping (Value) -> String) {
        _selection = selection
        self.options = options
        self.title = title
    }

    public var body: some View {
        HStack(spacing: MichaelSpace.xs / 2) {
            ForEach(options, id: \.self) { option in
                segment(option)
            }
        }
        .padding(.horizontal, MichaelSpace.xs)
        .background(Color.michael.raise, in: RoundedRectangle(cornerRadius: MichaelRadius.button))
        .overlay {
            RoundedRectangle(cornerRadius: MichaelRadius.button).strokeBorder(Color.michael.border)
        }
    }

    // The visible pill is buttonSmall high; the tap target is the full 44 point control height.
    private func segment(_ option: Value) -> some View {
        let isSelected = option == selection
        let pill = RoundedRectangle(cornerRadius: MichaelRadius.buttonSmall)
        return Button {
            selection = option
        } label: {
            Text(title(option))
                .michaelText(.label)
                .foregroundStyle(isSelected ? Color.michael.text : Color.michael.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.horizontal, MichaelSpace.xs)
                .frame(maxWidth: .infinity, minHeight: MichaelSize.buttonSmall)
                .background {
                    if isSelected {
                        ShadowedShape(shape: pill, fill: Color.michael.solid, layers: MichaelEffects.cardShadow(scheme))
                            .overlay { pill.strokeBorder(Color.michael.border2) }
                    }
                }
                .frame(minHeight: MichaelSize.checkTouch)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

#Preview {
    @Previewable @State var selection = "Pending"
    ThemePreview {
        MichaelSegmentedControl(selection: $selection, options: ["Pending", "Overdue", "Completed"]) { $0 }
    }
}
