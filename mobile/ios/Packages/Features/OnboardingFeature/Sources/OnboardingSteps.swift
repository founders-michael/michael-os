import DesignSystem
import Models
import SwiftUI

extension OnboardingModel {
    fileprivate func binding<Value>(_ keyPath: WritableKeyPath<OnboardingDraft, Value>) -> Binding<Value> {
        Binding(get: { self.state.draft[keyPath: keyPath] }, set: { value in self.edit { $0[keyPath: keyPath] = value } })
    }
}

struct NameStep: View {
    let model: OnboardingModel
    @State private var choosingZone = false

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.lg) {
            MichaelTextField(
                String(localized: "onboarding.name.field", bundle: .module),
                text: model.binding(\.preferredName),
                error: model.state.fieldErrors["preferredName"]
            )
            .textContentType(.givenName)
            VStack(alignment: .leading, spacing: MichaelSpace.xs) {
                Text(String(localized: "onboarding.zone.label", bundle: .module))
                    .michaelText(.label)
                    .foregroundStyle(Color.michael.muted)
                    .accessibilityHidden(true)
                Button {
                    choosingZone = true
                } label: {
                    HStack {
                        Text(model.state.draft.timeZone)
                            .foregroundStyle(Color.michael.text)
                        Spacer()
                        Text(gmtOffset(model.state.draft.timeZone))
                            .foregroundStyle(Color.michael.muted)
                    }
                    .michaelText(.body)
                    .padding(.horizontal, MichaelSpace.md)
                    .frame(minHeight: MichaelSize.field)
                    .background(Color.michael.solid, in: RoundedRectangle(cornerRadius: MichaelRadius.field))
                    .overlay {
                        RoundedRectangle(cornerRadius: MichaelRadius.field)
                            .strokeBorder(model.state.fieldErrors["timeZone"] == nil ? Color.michael.border2 : Color.michael.danger)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "onboarding.zone.label", bundle: .module))
                .accessibilityValue(model.state.draft.timeZone)
                Text(model.state.fieldErrors["timeZone"] ?? String(localized: "onboarding.zone.note", bundle: .module))
                    .michaelText(.caption)
                    .foregroundStyle(model.state.fieldErrors["timeZone"] == nil ? Color.michael.muted : Color.michael.danger)
            }
        }
        .sheet(isPresented: $choosingZone) {
            TimeZonePicker(selection: model.binding(\.timeZone))
        }
    }
}

struct SleepStep: View {
    let model: OnboardingModel

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.lg) {
            TimeRow(label: String(localized: "onboarding.sleep.wake", bundle: .module), time: model.binding(\.wakeUpTime))
            TimeRow(label: String(localized: "onboarding.sleep.bed", bundle: .module), time: model.binding(\.bedtime))
            AwakeBar(wake: model.state.draft.wakeUpTime, minutes: model.state.draft.awakeMinutes)
        }
    }
}

struct WorkStep: View {
    let model: OnboardingModel

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.lg) {
            Text(String(localized: "onboarding.work.days", bundle: .module))
                .michaelText(.label)
                .foregroundStyle(Color.michael.muted)
            HStack(spacing: MichaelSpace.xs) {
                ForEach(DayOfWeek.week, id: \.self) { day in
                    DayToggle(day: day, isOn: model.state.draft.workDays.contains(day)) {
                        model.edit { draft in
                            if draft.workDays.contains(day) {
                                draft.workDays.removeAll { $0 == day }
                            } else {
                                draft.workDays.append(day)
                            }
                        }
                    }
                }
            }
            TimeRow(
                label: String(localized: "onboarding.work.start", bundle: .module),
                time: hours(\.workStartTime, fallback: OnboardingDraft.defaultWorkStart)
            )
            TimeRow(
                label: String(localized: "onboarding.work.end", bundle: .module),
                time: hours(\.workEndTime, fallback: OnboardingDraft.defaultWorkEnd),
                error: model.state.fieldErrors["workEndTime"]
            )
        }
    }

    private func hours(_ keyPath: WritableKeyPath<OnboardingDraft, LocalTime?>, fallback: LocalTime) -> Binding<LocalTime> {
        Binding(
            get: { model.state.draft[keyPath: keyPath] ?? fallback },
            set: { value in model.edit { $0[keyPath: keyPath] = value } }
        )
    }
}

struct PrioritiesStep: View {
    let model: OnboardingModel
    @State private var typed = ""

    private var suggestions: [String] {
        OnboardingDraft.suggestedPriorities.filter { !model.state.draft.priorities.contains($0) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.lg) {
            ForEach(Array(model.state.draft.priorities.enumerated()), id: \.element) { index, priority in
                HStack(spacing: MichaelSpace.md) {
                    Text("\(index + 1)")
                        .michaelText(.label)
                        .foregroundStyle(Color.michael.onAccent)
                        .frame(width: MichaelSize.check, height: MichaelSize.check)
                        .background(Color.michael.accent, in: Circle())
                        .accessibilityHidden(true)
                    Text(priority)
                        .michaelText(.body)
                        .foregroundStyle(Color.michael.text)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Button {
                        model.removePriority(priority)
                    } label: {
                        Image(systemName: "xmark")
                            .foregroundStyle(Color.michael.muted)
                            .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(String(localized: "onboarding.priorities.remove \(priority)", bundle: .module))
                }
                .padding(.leading, MichaelSpace.md)
                .background(Color.michael.solid, in: RoundedRectangle(cornerRadius: MichaelRadius.field))
                .accessibilityElement(children: .combine)
            }
            MichaelTextField(
                String(localized: "onboarding.priorities.own", bundle: .module),
                text: $typed,
                error: model.state.fieldErrors["priorities"]
            )
            .submitLabel(.done)
            .onSubmit {
                if model.addPriority(typed) { typed = "" }
            }
            let full = model.state.draft.priorities.count >= OnboardingDraft.priorityLimit
            Text(String(localized: full ? "onboarding.priorities.fullHint" : "onboarding.priorities.suggestions", bundle: .module))
                .michaelText(.label)
                .foregroundStyle(Color.michael.muted)
            FlowLayout(spacing: MichaelSpace.sm) {
                ForEach(suggestions, id: \.self) { suggestion in
                    Button {
                        model.addPriority(suggestion)
                    } label: {
                        Text(suggestion)
                            .michaelText(.label)
                            .foregroundStyle(full ? Color.michael.faint : Color.michael.text)
                            .padding(.horizontal, MichaelSpace.md)
                            .frame(minHeight: MichaelSize.checkTouch)
                            .background(Color.michael.raise, in: Capsule())
                            .overlay { Capsule().strokeBorder(Color.michael.border2) }
                    }
                    .buttonStyle(.plain)
                    .disabled(full)
                }
            }
        }
    }
}

struct FocusStep: View {
    let model: OnboardingModel

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.lg) {
            MinuteStepper(
                label: String(localized: "onboarding.focus.session", bundle: .module),
                value: model.binding(\.focusSessionMinutes),
                range: OnboardingDraft.focusRange
            )
            MinuteStepper(
                label: String(localized: "onboarding.focus.break", bundle: .module),
                value: model.binding(\.breakDurationMinutes),
                range: OnboardingDraft.breakRange
            )
            Text(String(localized: "onboarding.focus.style", bundle: .module))
                .michaelText(.label)
                .foregroundStyle(Color.michael.muted)
                .accessibilityAddTraits(.isHeader)
            ForEach([PlanningStyle.structured, .balanced, .flexible], id: \.self) { style in
                StyleOption(style: style, isSelected: model.state.draft.planningStyle == style) {
                    model.edit { $0.planningStyle = style }
                }
            }
        }
    }
}
