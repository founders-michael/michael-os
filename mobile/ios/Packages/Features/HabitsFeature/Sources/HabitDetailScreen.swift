import DesignSystem
import Models
import Repositories
import SwiftUI

enum HabitChange {
    case saved(Habit)
    case deleted
}

/// One habit: today's check-in, the server's stats, the last 30 days, archive and delete.
struct HabitDetailScreen: View {
    @State private var model: HabitDetailModel
    let habits: any HabitRepository
    let onChange: (HabitChange) -> Void
    @State private var editing: Habit?
    @State private var confirmingDelete = false
    @Environment(\.dismiss) private var dismiss

    init(model: @autoclosure () -> HabitDetailModel, habits: any HabitRepository, onChange: @escaping (HabitChange) -> Void) {
        _model = State(initialValue: model())
        self.habits = habits
        self.onChange = onChange
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MichaelSpace.lg) {
                header
                if model.habit.status == .active && model.habit.todayScheduled {
                    MichaelButton(
                        model.habit.completedToday
                            ? String(localized: "habits.detail.undo", bundle: .module)
                            : String(localized: "habits.detail.checkIn", bundle: .module),
                        style: model.habit.completedToday ? .secondary : .primary
                    ) {
                        _Concurrency.Task {
                            await model.toggleToday()
                            onChange(.saved(model.habit))
                        }
                    }
                    .disabled(model.busy != nil)
                }
                if let problem = model.problem { ErrorBanner(message: HabitFormat.loadMessage(problem)) }
                stats
                HabitMonth(habit: model.habit)
                actions
            }
            .padding(.horizontal, MichaelSpace.screenGutter)
            .padding(.bottom, MichaelSpace.xl)
        }
        .background(MichaelBackground())
        .navigationTitle(String(localized: "habits.detail.title", bundle: .module))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button(String(localized: "habits.detail.edit", bundle: .module)) { editing = model.habit }
            }
        }
        .task { await model.load() }
        .onChange(of: model.deleted) { _, deleted in
            if deleted {
                onChange(.deleted)
                dismiss()
            }
        }
        .sheet(item: $editing) { habit in
            HabitEditorSheet(model: HabitEditorModel(habit: habit, habits: habits)) { saved in
                model.saved(saved)
                onChange(.saved(saved))
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.sm) {
            MichaelChip(HabitFormat.schedule(model.habit), tone: model.habit.status == .archived ? .plain : .ai)
            Text(model.habit.title)
                .michaelText(.display)
                .foregroundStyle(Color.michael.text)
                .accessibilityAddTraits(.isHeader)
            if let notes = model.habit.description {
                Text(notes).michaelText(.body).foregroundStyle(Color.michael.muted)
            }
        }
    }

    private var stats: some View {
        let habit = model.habit
        return VStack(alignment: .leading, spacing: MichaelSpace.sm) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: MichaelSpace.sm) { tiles(habit) }
                VStack(spacing: MichaelSpace.sm) { tiles(habit) }
            }
            Text(history(habit))
                .michaelText(.caption)
                .foregroundStyle(Color.michael.muted)
        }
    }

    private func history(_ habit: Habit) -> String {
        let (start, end) = (HabitFormat.date(habit.periodStart), HabitFormat.date(habit.periodEnd))
        return String(localized: "habits.detail.history \(habit.completedDays) \(habit.eligibleDays) \(start) \(end)", bundle: .module)
    }

    @ViewBuilder private func tiles(_ habit: Habit) -> some View {
        StatTile(value: "\(habit.currentStreak)", label: String(localized: "habits.detail.current", bundle: .module), isHighlighted: true)
        StatTile(value: "\(habit.bestStreak)", label: String(localized: "habits.detail.best", bundle: .module))
        StatTile(value: "\(habit.completionPercentage)%", label: String(localized: "habits.detail.completed", bundle: .module))
    }

    private var actions: some View {
        VStack(spacing: MichaelSpace.sm) {
            if model.habit.status == .archived {
                MichaelButton(String(localized: "habits.detail.reactivate", bundle: .module), style: .secondary) {
                    _Concurrency.Task {
                        await model.setArchived(false)
                        onChange(.saved(model.habit))
                    }
                }
            } else {
                MichaelButton(String(localized: "habits.detail.archive", bundle: .module), style: .secondary) {
                    _Concurrency.Task {
                        await model.setArchived(true)
                        onChange(.saved(model.habit))
                    }
                }
            }
            MichaelButton(String(localized: "habits.detail.delete", bundle: .module), style: .destructive) { confirmingDelete = true }
        }
        .disabled(model.busy != nil)
        .confirmationDialog(
            String(localized: "habits.delete.title", bundle: .module), isPresented: $confirmingDelete, titleVisibility: .visible
        ) {
            Button(String(localized: "habits.delete.confirm", bundle: .module), role: .destructive) {
                _Concurrency.Task { await model.delete() }
            }
        } message: {
            Text(String(localized: "habits.delete.message", bundle: .module))
        }
    }
}

/// The last 30 days: done, missed (scheduled, not done), not scheduled, and today.
private struct HabitMonth: View {
    let habit: Habit

    var body: some View {
        VStack(alignment: .leading, spacing: MichaelSpace.sm) {
            Text(String(localized: "habits.detail.month", bundle: .module))
                .michaelText(.label)
                .foregroundStyle(Color.michael.muted)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: MichaelSpace.xs), count: 10), spacing: MichaelSpace.xs) {
                ForEach(days, id: \.self) { day in
                    RoundedRectangle(cornerRadius: MichaelRadius.buttonSmall / 2)
                        .fill(fill(day))
                        .overlay {
                            if day == habit.today {
                                RoundedRectangle(cornerRadius: MichaelRadius.buttonSmall / 2).strokeBorder(
                                    Color.michael.accent, lineWidth: 2)
                            }
                        }
                        .aspectRatio(1, contentMode: .fit)
                        .accessibilityLabel(label(day))
                }
            }
            HStack(spacing: MichaelSpace.md) {
                legend(Color.michael.accent, String(localized: "habits.detail.done", bundle: .module))
                legend(Color.michael.track, String(localized: "habits.detail.missed", bundle: .module))
                legend(Color.michael.raise, String(localized: "habits.detail.off", bundle: .module))
            }
            .michaelText(.caption)
            .foregroundStyle(Color.michael.muted)
        }
    }

    private var days: [LocalDate] { (0..<30).map { habit.today.adding(days: $0 - 29) } }

    private func fill(_ day: LocalDate) -> Color {
        if habit.isDone(on: day) { return Color.michael.accent }
        return habit.isMissed(on: day) ? Color.michael.track : Color.michael.raise
    }

    private func label(_ day: LocalDate) -> String {
        let date = HabitFormat.date(day)
        if habit.isDone(on: day) { return String(localized: "habits.day.done \(date)", bundle: .module) }
        if habit.isMissed(on: day) { return String(localized: "habits.day.missed \(date)", bundle: .module) }
        return date
    }

    private func legend(_ color: Color, _ text: String) -> some View {
        HStack(spacing: MichaelSpace.xs) {
            RoundedRectangle(cornerRadius: 3).fill(color).frame(width: MichaelSpace.md, height: MichaelSpace.md)
            Text(text)
        }
    }
}
