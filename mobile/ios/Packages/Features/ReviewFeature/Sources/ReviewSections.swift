import DesignSystem
import Models
import SwiftUI

/// Scheduled time only. Actual time is not tracked, and nothing is inferred from the schedule.
struct TimeCard: View {
    let time: ReviewTime

    var body: some View {
        MichaelCard {
            VStack(alignment: .leading, spacing: MichaelSpace.sm) {
                Text(String(localized: "review.time", bundle: .module)).michaelText(.eyebrow).foregroundStyle(Color.michael.muted)
                row(
                    String(localized: "review.time.working", bundle: .module),
                    time.plannedWorkingMinutes.map(ReviewFormat.duration)
                        ?? String(localized: "review.time.noAvailability", bundle: .module))
                row(String(localized: "review.time.tasks", bundle: .module), ReviewFormat.duration(time.scheduledTaskMinutes))
                row(String(localized: "review.time.calendar", bundle: .module), ReviewFormat.duration(time.scheduledCalendarMinutes))
                row(String(localized: "review.time.actual", bundle: .module), String(localized: "review.time.unavailable", bundle: .module))
                Text(String(localized: "review.time.note", bundle: .module)).michaelText(.caption).foregroundStyle(Color.michael.faint)
            }
        }
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).michaelText(.body).foregroundStyle(Color.michael.muted)
            Spacer()
            Text(value).michaelText(.label).foregroundStyle(Color.michael.text)
        }
        .accessibilityElement(children: .combine)
    }
}

struct WeekCard: View {
    let week: ReviewWeek

    var body: some View {
        MichaelCard {
            VStack(alignment: .leading, spacing: MichaelSpace.sm) {
                Text(String(localized: "review.week", bundle: .module)).michaelText(.eyebrow).foregroundStyle(Color.michael.muted)
                Text(String(localized: "review.week.summary \(week.completed) \(week.planned) \(week.completionPercent)", bundle: .module))
                    .michaelText(.body)
                    .foregroundStyle(Color.michael.text)
                HStack(alignment: .bottom, spacing: MichaelSpace.xs) {
                    ForEach(week.days, id: \.date) { day in
                        VStack(spacing: MichaelSpace.xs) {
                            MichaelProgressBar(value: day.planned == 0 ? 0 : Double(day.completed) / Double(day.planned))
                            Text(ReviewFormat.weekday(day.date)).michaelText(.caption).foregroundStyle(Color.michael.muted)
                        }
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(
                            String(
                                localized: "review.week.day \(ReviewFormat.weekday(day.date)) \(day.completed) \(day.planned)",
                                bundle: .module))
                    }
                }
                Text(
                    String(
                        localized: "review.week.detail \(week.incomplete) \(week.rescheduled) \(week.consistencyDays)", bundle: .module)
                )
                .michaelText(.caption)
                .foregroundStyle(Color.michael.muted)
                Text(
                    String(
                        localized:
                            "review.week.habits \(week.habits.completed) \(week.habits.scheduled) \(week.habits.consistencyPercent)",
                        bundle: .module)
                )
                .michaelText(.caption)
                .foregroundStyle(Color.michael.muted)
            }
        }
    }
}

/// The five reflection prompts, the web's wording. Saved as the user types.
struct ReflectionFields: View {
    let model: ReviewModel

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.md) {
            Text(String(localized: "review.reflection", bundle: .module))
                .michaelText(.eyebrow)
                .foregroundStyle(Color.michael.muted)
                .accessibilityAddTraits(.isHeader)
            Text(String(localized: "review.reflection.intro", bundle: .module)).michaelText(.caption).foregroundStyle(Color.michael.faint)
            if case .failed(let error) = model.saveState { ErrorBanner(message: ReviewFormat.saveFailure(error)) }
            ForEach(ReflectionDraft.Field.allCases, id: \.self) { field in
                VStack(alignment: .leading, spacing: MichaelSpace.xs) {
                    Text(ReviewFormat.prompt(field)).michaelText(.label).foregroundStyle(Color.michael.muted)
                    TextField(
                        ReviewFormat.placeholder(field),
                        text: Binding(get: { model.draft[field] }, set: { model.edit(field, $0) }), axis: .vertical
                    )
                    .lineLimit(3...8)
                    .michaelText(.body)
                    .accessibilityLabel(ReviewFormat.prompt(field))
                    .michaelFieldFrame()
                }
            }
        }
    }
}
