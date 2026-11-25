import SwiftUI

/// The look of an editable field: dashed while a required value is missing, red when refused.
public struct MichaelFieldFrame: ViewModifier {
    public enum Tone: Sendable {
        case plain, missing, error
    }

    let tone: Tone

    public init(tone: Tone) {
        self.tone = tone
    }

    public func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: MichaelRadius.field)
        content
            .michaelText(.body)
            .foregroundStyle(Color.michael.text)
            .tint(Color.michael.accent)
            .padding(.horizontal, MichaelSpace.md)
            .padding(.vertical, MichaelSpace.sm)
            .frame(minHeight: MichaelSize.field)
            .background(Color.michael.solid, in: shape)
            .overlay {
                switch tone {
                case .plain: shape.strokeBorder(Color.michael.border2)
                case .missing: shape.strokeBorder(Color.michael.warn, style: StrokeStyle(lineWidth: 1, dash: [MichaelSpace.xs]))
                case .error: shape.strokeBorder(Color.michael.danger)
                }
            }
    }
}

extension View {
    public func michaelFieldFrame(_ tone: MichaelFieldFrame.Tone = .plain) -> some View {
        modifier(MichaelFieldFrame(tone: tone))
    }
}

/// Days of the week as toggles, in the order the device's week starts. Days are ISO numbers, 1 for Monday.
public struct MichaelWeekdayPicker: View {
    private let selected: Set<Int>
    private let onChange: (Set<Int>) -> Void

    public init(selected: Set<Int>, onChange: @escaping (Set<Int>) -> Void) {
        self.selected = selected
        self.onChange = onChange
    }

    public var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: MichaelSize.checkTouch), spacing: MichaelSpace.sm)], spacing: MichaelSpace.sm) {
            ForEach(Self.days, id: \.self) { day in
                let isOn = selected.contains(day)
                Button {
                    onChange(isOn ? selected.subtracting([day]) : selected.union([day]))
                } label: {
                    Text(Calendar.current.shortStandaloneWeekdaySymbols[day % 7])
                        .michaelText(.label)
                        .foregroundStyle(isOn ? Color.michael.onfill : Color.michael.text)
                        .frame(maxWidth: .infinity, minHeight: MichaelSize.checkTouch)
                        .background(isOn ? Color.michael.fill : Color.michael.solid, in: Capsule())
                        .overlay { Capsule().strokeBorder(isOn ? Color.clear : Color.michael.border2) }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Calendar.current.standaloneWeekdaySymbols[day % 7])
                .accessibilityAddTraits(isOn ? .isSelected : [])
            }
        }
    }

    private static var days: [Int] {
        let first = Calendar.current.firstWeekday
        return (0..<7).map { offset in ((first - 1 + offset + 6) % 7) + 1 }
    }
}
