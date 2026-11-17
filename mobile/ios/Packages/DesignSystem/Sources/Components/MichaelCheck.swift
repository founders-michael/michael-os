import SwiftUI

public struct MichaelCheck: View {
    private let isChecked: Bool
    private let label: String
    private let action: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(isChecked: Bool, label: String, action: @escaping () -> Void) {
        self.isChecked = isChecked
        self.label = label
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            ZStack {
                Circle().strokeBorder(Color.michael.border2, lineWidth: 1.5)
                Circle()
                    .fill(Color.michael.accent)
                    .scaleEffect(isChecked || reduceMotion ? 1 : 0.01)
                    .opacity(isChecked ? 1 : 0)
                Tick()
                    .trim(from: 0, to: isChecked || reduceMotion ? 1 : 0)
                    .stroke(
                        Color.michael.onAccent,
                        style: StrokeStyle(lineWidth: MichaelSize.check / 12, lineCap: .round, lineJoin: .round)
                    )
                    .opacity(isChecked ? 1 : 0)
                    .padding(MichaelSize.check / 5)
            }
            .frame(width: MichaelSize.check, height: MichaelSize.check)
            .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .animation(.easeOut(duration: MichaelMotion.check), value: isChecked)
        .sensoryFeedback(.impact(weight: .light), trigger: isChecked) { _, checked in checked }
        .accessibilityLabel(label)
        .accessibilityAddTraits(isChecked ? [.isToggle, .isSelected] : .isToggle)
    }
}

// The tick from the mocks: M5 12 l5 5 9-10 in a 24 point box.
private struct Tick: Shape {
    func path(in rect: CGRect) -> Path {
        let unit = rect.width / 14
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY + 7 * unit))
        path.addLine(to: CGPoint(x: rect.minX + 5 * unit, y: rect.minY + 12 * unit))
        path.addLine(to: CGPoint(x: rect.minX + 14 * unit, y: rect.minY + 2 * unit))
        return path
    }
}

#Preview {
    @Previewable @State var checked = false
    ThemePreview {
        HStack {
            MichaelCheck(isChecked: checked, label: "Send the investor update") { checked.toggle() }
            MichaelCheck(isChecked: true, label: "Done") {}
        }
    }
}
