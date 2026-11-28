import DesignSystem
import Models
import SwiftUI

/// Open tasks with no future session, due first. Choosing one opens the editor as a focus session for it.
struct UnscheduledSheet: View {
    let tasks: [UnscheduledTask]
    let onSchedule: (UnscheduledTask) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(String(localized: "calendar.unscheduled.intro", bundle: .module))
                        .michaelText(.body)
                        .foregroundStyle(Color.michael.muted)
                        .padding(.bottom, MichaelSpace.md)
                    ForEach(tasks) { task in
                        Button {
                            onSchedule(task)
                        } label: {
                            HStack(spacing: MichaelSpace.md) {
                                VStack(alignment: .leading, spacing: MichaelSpace.xs / 2) {
                                    Text(task.title).michaelText(.body).foregroundStyle(Color.michael.text).lineLimit(2)
                                    Text(detail(task)).michaelText(.caption).foregroundStyle(Color.michael.muted)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                Text(String(localized: "calendar.unscheduled.schedule", bundle: .module))
                                    .michaelText(.label)
                                    .foregroundStyle(Color.michael.atext)
                            }
                            .frame(minHeight: MichaelSize.button + MichaelSpace.lg)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint(String(localized: "calendar.unscheduled.hint", bundle: .module))
                        .overlay(alignment: .bottom) { Rectangle().fill(Color.michael.border).frame(height: 1) }
                    }
                }
                .padding(MichaelSpace.screenGutter)
            }
            .background(MichaelBackground())
            .navigationTitle(String(localized: "calendar.unscheduled.title", bundle: .module))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "calendar.sheet.close", bundle: .module)) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func detail(_ task: UnscheduledTask) -> String {
        var parts: [String] = []
        if let due = task.dueDate {
            parts.append(String(localized: "calendar.unscheduled.due \(CalendarFormat.shortDate(due))", bundle: .module))
        }
        if let minutes = task.estimatedDurationMinutes {
            parts.append(String(localized: "calendar.unscheduled.minutes \(minutes)", bundle: .module))
        } else {
            parts.append(String(localized: "calendar.unscheduled.noEstimate", bundle: .module))
        }
        return parts.joined(separator: " · ")
    }
}
