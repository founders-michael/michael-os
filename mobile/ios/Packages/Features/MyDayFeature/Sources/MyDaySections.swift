import DesignSystem
import Models
import SwiftUI

struct MyDayContentView: View {
    let day: MyDayContent
    let isEmpty: Bool
    let now: Date
    let onStep: (Int) -> Void
    let onToday: () -> Void
    let onToggleTask: (Task.ID) -> Void
    let onToggleHabit: (Habit.ID) -> Void
    let onRefresh: () async -> Void
    let actions: MyDayActions

    private var myDay: MyDay { day.myDay }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MichaelSpace.lg) {
                if let problem = day.refreshProblem {
                    RefreshProblem(error: problem, loadedAt: day.loadedAt, timeZone: myDay.timeZone) {
                        _Concurrency.Task { await onRefresh() }
                    }
                }
                MyDayHeader(day: day, onStep: onStep, onToday: onToday)
                if !myDay.notices.isEmpty {
                    NoticesCard(notices: myDay.notices, onAsk: actions.ask)
                }
                if isEmpty {
                    EmptyStateView(
                        title: String(localized: day.isToday ? "myDay.empty.title" : "myDay.empty.titleOtherDay", bundle: .module),
                        message: String(localized: "myDay.empty.message", bundle: .module),
                        actionTitle: String(localized: "myDay.empty.action", bundle: .module),
                        action: actions.addTask
                    )
                    .padding(.vertical, MichaelSpace.xl)
                } else {
                    sections
                }
            }
            .padding(.horizontal, MichaelSpace.screenGutter)
            .padding(.vertical, MichaelSpace.lg)
        }
        .refreshable { await onRefresh() }
        // Without a navigation bar nothing sits behind the status bar, so scrolled content would run under it.
        .safeAreaInset(edge: .top, spacing: 0) {
            Color.clear.frame(height: 0).background(.bar, ignoresSafeAreaEdges: .top)
        }
    }

    @ViewBuilder private var sections: some View {
        if let summary = myDay.tasks?.dailySummary, summary.total > 0 {
            ProgressCard(summary: summary, isToday: day.isToday, next: day.nextItem(at: now), timeZone: myDay.timeZone)
        }
        TimelineSection(day: day, onOpenCalendar: actions.openCalendar, onRetry: onRefresh)
        TasksSection(day: day, onToggle: onToggleTask, onRetry: onRefresh)
        HabitsSection(day: day, onToggle: onToggleHabit, onRetry: onRefresh)
    }
}

private struct MyDayHeader: View {
    let day: MyDayContent
    let onStep: (Int) -> Void
    let onToday: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.sm) {
            Text(MyDayFormat.date(day.myDay.selectedDate))
                .michaelText(.eyebrow)
                .foregroundStyle(Color.michael.faint)
            Text(String(localized: "myDay.greeting \(day.myDay.greeting) \(day.myDay.greetingName)", bundle: .module))
                .michaelText(.display)
                .foregroundStyle(Color.michael.text)
                .accessibilityAddTraits(.isHeader)
            if day.isToday, let briefing = day.myDay.briefing {
                Text(briefing)
                    .michaelText(.body)
                    .foregroundStyle(Color.michael.muted)
            }
            DayStepper(isToday: day.isToday, onStep: onStep, onToday: onToday)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct DayStepper: View {
    let isToday: Bool
    let onStep: (Int) -> Void
    let onToday: () -> Void

    var body: some View {
        HStack(spacing: MichaelSpace.sm) {
            stepButton(systemImage: "chevron.left", label: "myDay.previousDay") { onStep(-1) }
            Button(action: onToday) {
                Text(String(localized: "myDay.today", bundle: .module))
                    .michaelText(.label)
                    .foregroundStyle(isToday ? Color.michael.text : Color.michael.atext)
                    .padding(.horizontal, MichaelSpace.md)
                    .frame(minHeight: MichaelSize.checkTouch)
            }
            .buttonStyle(.plain)
            .disabled(isToday)
            .accessibilityHint(String(localized: "myDay.today.hint", bundle: .module))
            stepButton(systemImage: "chevron.right", label: "myDay.nextDay") { onStep(1) }
        }
    }

    private func stepButton(systemImage: String, label: String.LocalizationValue, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.body.weight(.semibold))
                .foregroundStyle(Color.michael.muted)
                .frame(width: MichaelSize.checkTouch, height: MichaelSize.checkTouch)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: label, bundle: .module))
    }
}

private struct RefreshProblem: View {
    let error: AppError
    let loadedAt: Date
    let timeZone: String
    let onRetry: () -> Void

    var body: some View {
        let time = MyDayFormat.time(loadedAt, in: timeZone)
        if error.isConnectionProblem {
            OfflineBanner(message: String(localized: "myDay.offline \(time)", bundle: .module), onRetry: onRetry)
        } else {
            ErrorBanner(message: String(localized: "myDay.refreshFailed \(time)", bundle: .module))
        }
    }
}

private struct NoticesCard: View {
    let notices: [MyDayNotice]
    let onAsk: (String?) -> Void

    var body: some View {
        AICard {
            VStack(alignment: .leading, spacing: MichaelSpace.md) {
                HStack(spacing: MichaelSpace.sm) {
                    MichaelOrb(size: .small)
                    Text(String(localized: "myDay.notices.title", bundle: .module))
                        .michaelText(.heading)
                        .foregroundStyle(Color.michael.text)
                        .accessibilityAddTraits(.isHeader)
                }
                ForEach(notices) { notice in
                    VStack(alignment: .leading, spacing: MichaelSpace.sm) {
                        MichaelChip(notice.tag, tone: notice.tone == .warn ? .warn : .ai)
                        Text(notice.text)
                            .michaelText(.body)
                            .foregroundStyle(Color.michael.text)
                        if let prompt = notice.prompt {
                            MichaelButton(notice.actionLabel, style: .secondary, size: .small) { onAsk(prompt) }
                        }
                    }
                }
            }
        }
    }
}

private struct ProgressCard: View {
    let summary: DailyTaskSummary
    let isToday: Bool
    let next: TimelineItem?
    let timeZone: String

    var body: some View {
        MichaelCard {
            VStack(alignment: .leading, spacing: MichaelSpace.md) {
                HStack {
                    Text(String(localized: isToday ? "myDay.progress.today" : "myDay.progress.otherDay", bundle: .module))
                        .michaelText(.label)
                        .foregroundStyle(Color.michael.muted)
                    Spacer()
                    Text(String(localized: "myDay.progress.done \(summary.completed) \(summary.total)", bundle: .module))
                        .michaelText(.label)
                        .monospacedDigit()
                        .foregroundStyle(Color.michael.text)
                }
                MichaelProgressBar(value: Double(summary.completionPercent) / 100)
                if summary.unclassified > 0 {
                    Text(String(localized: "myDay.progress.unclassified \(summary.unclassified)", bundle: .module))
                        .michaelText(.caption)
                        .foregroundStyle(Color.michael.faint)
                }
                if let next {
                    let range = MyDayFormat.timeRange(next.startAt, next.endAt, in: timeZone)
                    HStack(spacing: MichaelSpace.sm) {
                        Image(systemName: "clock")
                            .foregroundStyle(Color.michael.muted)
                            .accessibilityHidden(true)
                        Text(String(localized: "myDay.progress.next \(next.label) \(range)", bundle: .module))
                            .michaelText(.label)
                            .foregroundStyle(Color.michael.muted)
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}
