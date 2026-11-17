import SwiftUI

public struct MichaelToggle: View {
    private let label: String
    @Binding private var isOn: Bool

    public init(_ label: String, isOn: Binding<Bool>) {
        self.label = label
        _isOn = isOn
    }

    public var body: some View {
        Toggle(isOn: $isOn) {
            Text(label)
                .michaelText(.body)
                .foregroundStyle(Color.michael.text)
        }
        .toggleStyle(MichaelSwitchStyle())
    }
}

private struct MichaelSwitchStyle: ToggleStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // Track and knob sizes come from the NotificationSettings mock; tokens.json has no switch entry.
    private let trackWidth: CGFloat = 46
    private let trackHeight = MichaelSize.chip
    private let knobInset: CGFloat = 3

    func makeBody(configuration: Configuration) -> some View {
        Button {
            configuration.isOn.toggle()
        } label: {
            HStack(spacing: MichaelSpace.md) {
                configuration.label
                    .frame(maxWidth: .infinity, alignment: .leading)
                ZStack(alignment: configuration.isOn ? .trailing : .leading) {
                    Capsule().fill(configuration.isOn ? Color.michael.accent : Color.michael.track)
                    Circle()
                        .fill(Color.michael.onfill)
                        .padding(knobInset)
                        .frame(width: trackHeight)
                }
                .frame(width: trackWidth, height: trackHeight)
                .animation(reduceMotion ? nil : .easeOut(duration: MichaelMotion.press), value: configuration.isOn)
            }
            .frame(minHeight: MichaelSize.checkTouch)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityRepresentation {
            Toggle(isOn: configuration.$isOn) { configuration.label }
        }
    }
}

#Preview {
    @Previewable @State var isOn = true
    ThemePreview {
        MichaelToggle("Daily plan reminder", isOn: $isOn)
    }
}
