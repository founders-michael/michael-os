import DesignSystem
import Models
import SwiftUI

struct TimeRow: View {
    let label: String
    @Binding var time: LocalTime
    var error: String?

    // LocalTime has no date or zone, so it goes through a fixed UTC day to reach the picker and back.
    private static let utc = TimeZone(identifier: "UTC") ?? .current

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.xs) {
            HStack {
                Text(label)
                    .michaelText(.body)
                    .foregroundStyle(Color.michael.text)
                Spacer()
                DatePicker(label, selection: date, displayedComponents: .hourAndMinute)
                    .labelsHidden()
                    .environment(\.timeZone, Self.utc)
                    .tint(Color.michael.accent)
            }
            .frame(minHeight: MichaelSize.field)
            if let error {
                Text(error)
                    .michaelText(.caption)
                    .foregroundStyle(Color.michael.danger)
            }
        }
    }

    private var date: Binding<Date> {
        Binding(
            get: { Date(timeIntervalSince1970: TimeInterval(time.minutesSinceMidnight * 60)) },
            set: { date in
                var calendar = Calendar(identifier: .gregorian)
                calendar.timeZone = Self.utc
                let parts = calendar.dateComponents([.hour, .minute], from: date)
                time = LocalTime(hour: parts.hour ?? 0, minute: parts.minute ?? 0)
            }
        )
    }
}

struct AwakeBar: View {
    let wake: LocalTime
    let minutes: Int

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.sm) {
            GeometryReader { proxy in
                let day = 24.0 * 60
                let start = Double(wake.minutesSinceMidnight) / day
                let length = Double(minutes) / day
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.michael.track)
                    Capsule()
                        .fill(Color.michael.accent)
                        .frame(width: proxy.size.width * min(length, 1 - start))
                        .offset(x: proxy.size.width * start)
                    if start + length > 1 {
                        Capsule()
                            .fill(Color.michael.accent)
                            .frame(width: proxy.size.width * (start + length - 1))
                    }
                }
            }
            .frame(height: MichaelSize.progressTrack)
            Text(String(localized: "onboarding.sleep.awake \(minutes / 60) \(minutes % 60)", bundle: .module))
                .michaelText(.label)
                .foregroundStyle(Color.michael.muted)
        }
        .accessibilityElement(children: .combine)
    }
}

struct DayToggle: View {
    let day: DayOfWeek
    let isOn: Bool
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            Text(day.initial)
                .michaelText(.button)
                .foregroundStyle(isOn ? Color.michael.onfill : Color.michael.muted)
                .frame(maxWidth: .infinity, minHeight: MichaelSize.button)
                .background(isOn ? Color.michael.fill : Color.clear, in: RoundedRectangle(cornerRadius: MichaelRadius.button))
                .overlay {
                    RoundedRectangle(cornerRadius: MichaelRadius.button).strokeBorder(isOn ? Color.clear : Color.michael.border2)
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(day.name)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

struct MinuteStepper: View {
    let label: String
    @Binding var value: Int
    let range: ClosedRange<Int>

    var body: some View {
        HStack {
            Text(label)
                .michaelText(.body)
                .foregroundStyle(Color.michael.text)
            Spacer()
            stepButton("minus", String(localized: "onboarding.focus.shorter", bundle: .module), -OnboardingDraft.minuteStep)
            Text(String(localized: "onboarding.focus.minutes \(value)", bundle: .module))
                .michaelText(.heading)
                .foregroundStyle(Color.michael.text)
                .monospacedDigit()
            stepButton("plus", String(localized: "onboarding.focus.longer", bundle: .module), OnboardingDraft.minuteStep)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue(String(localized: "onboarding.focus.minutes \(value)", bundle: .module))
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: change(OnboardingDraft.minuteStep)
            case .decrement: change(-OnboardingDraft.minuteStep)
            @unknown default: break
            }
        }
    }

    private func stepButton(_ symbol: String, _ accessibilityLabel: String, _ delta: Int) -> some View {
        Button {
            change(delta)
        } label: {
            Image(systemName: symbol)
                .foregroundStyle(Color.michael.text)
                .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
                .background(Color.michael.raise, in: Circle())
        }
        .buttonStyle(.plain)
        .disabled(!range.contains(value + delta))
        .accessibilityLabel(accessibilityLabel)
    }

    private func change(_ delta: Int) {
        value = min(range.upperBound, max(range.lowerBound, value + delta))
    }
}

struct StyleOption: View {
    let style: PlanningStyle
    let isSelected: Bool
    let select: () -> Void

    var body: some View {
        Button(action: select) {
            HStack(spacing: MichaelSpace.md) {
                Circle()
                    .strokeBorder(
                        isSelected ? Color.michael.accent : Color.michael.border2, lineWidth: isSelected ? MichaelSize.check / 3 : 1
                    )
                    .frame(width: MichaelSize.check, height: MichaelSize.check)
                VStack(alignment: .leading, spacing: MichaelSpace.xs) {
                    Text(style.title)
                        .michaelText(.heading)
                        .foregroundStyle(Color.michael.text)
                    Text(style.detail)
                        .michaelText(.label)
                        .foregroundStyle(Color.michael.muted)
                }
                Spacer(minLength: 0)
            }
            .padding(MichaelSpace.md)
            .background(isSelected ? Color.michael.chip : Color.michael.solid, in: RoundedRectangle(cornerRadius: MichaelRadius.stat))
            .overlay {
                RoundedRectangle(cornerRadius: MichaelRadius.stat)
                    .strokeBorder(isSelected ? Color.michael.accent : Color.michael.border2)
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

struct FlowLayout: Layout {
    let spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        return CGSize(width: proposal.width ?? rows.width, height: rows.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for (index, point) in arrange(width: bounds.width, subviews: subviews).origins.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y), proposal: .unspecified)
        }
    }

    private struct Arrangement {
        var origins: [CGPoint] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> Arrangement {
        var origins: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var widest: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            origins.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            widest = max(widest, x - spacing)
        }
        return Arrangement(origins: origins, width: widest, height: y + rowHeight)
    }
}

extension DayOfWeek {
    var initial: String {
        switch self {
        case .monday: String(localized: "day.monday.initial", bundle: .module)
        case .tuesday: String(localized: "day.tuesday.initial", bundle: .module)
        case .wednesday: String(localized: "day.wednesday.initial", bundle: .module)
        case .thursday: String(localized: "day.thursday.initial", bundle: .module)
        case .friday: String(localized: "day.friday.initial", bundle: .module)
        case .saturday: String(localized: "day.saturday.initial", bundle: .module)
        case .sunday, .unknown: String(localized: "day.sunday.initial", bundle: .module)
        }
    }

    var name: String {
        switch self {
        case .monday: String(localized: "day.monday", bundle: .module)
        case .tuesday: String(localized: "day.tuesday", bundle: .module)
        case .wednesday: String(localized: "day.wednesday", bundle: .module)
        case .thursday: String(localized: "day.thursday", bundle: .module)
        case .friday: String(localized: "day.friday", bundle: .module)
        case .saturday: String(localized: "day.saturday", bundle: .module)
        case .sunday, .unknown: String(localized: "day.sunday", bundle: .module)
        }
    }
}

extension PlanningStyle {
    var title: String {
        switch self {
        case .structured: String(localized: "style.structured", bundle: .module)
        case .flexible: String(localized: "style.flexible", bundle: .module)
        case .balanced, .unknown: String(localized: "style.balanced", bundle: .module)
        }
    }

    var detail: String {
        switch self {
        case .structured: String(localized: "style.structured.detail", bundle: .module)
        case .flexible: String(localized: "style.flexible.detail", bundle: .module)
        case .balanced, .unknown: String(localized: "style.balanced.detail", bundle: .module)
        }
    }
}

/// "GMT+5:30" for a zone, at the current date.
func gmtOffset(_ identifier: String) -> String {
    let seconds = TimeZone(identifier: identifier)?.secondsFromGMT() ?? 0
    let sign = seconds < 0 ? "-" : "+"
    let hours = abs(seconds) / 3600
    let minutes = abs(seconds) % 3600 / 60
    return minutes == 0 ? "GMT\(sign)\(hours)" : "GMT\(sign)\(hours):\(String(format: "%02d", minutes))"
}
