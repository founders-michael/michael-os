import DesignSystem
import SwiftUI

/// Segments, or a menu at the accessibility text sizes, where the segments cut their labels.
struct ChoiceControl<Value: Hashable>: View {
    let label: String
    @Binding var selection: Value
    let options: [Value]
    let title: (Value) -> String
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        if typeSize.isAccessibilitySize {
            Picker(label, selection: $selection) {
                ForEach(options, id: \.self) { Text(title($0)).tag($0) }
            }
            .pickerStyle(.menu)
            .tint(Color.michael.text)
            .michaelFieldFrame()
        } else {
            MichaelSegmentedControl(selection: $selection, options: options, title: title)
                .accessibilityLabel(label)
        }
    }
}
