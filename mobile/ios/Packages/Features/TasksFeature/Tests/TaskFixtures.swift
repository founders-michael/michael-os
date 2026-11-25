import Foundation
import Models
import TestSupport

@testable import TasksFeature

enum TaskFixtures {
    static let today = LocalDate("2026-11-17")

    static func task(
        _ id: String, title: String? = nil, status: TaskStatus = .todo, priority: TaskPriority = .medium,
        due: String? = nil, recurrence: TaskRecurrence? = nil, remindAt: Date? = nil, reminderSent: Bool = false
    ) -> Task {
        Task(
            id: id, title: title ?? "Task \(id)", description: nil, status: status, priority: priority,
            estimatedDurationMinutes: 30, remainingDurationMinutes: nil, dueDate: due.flatMap(LocalDate.init),
            completedAt: nil, createdAt: .now, updatedAt: .now, recurrence: recurrence, remindAt: remindAt,
            reminderSent: reminderSent
        )
    }

    static let weekly = TaskRecurrence(
        frequency: .weekly, interval: 1, weekdays: [2], monthDay: nil, endsOn: nil, active: true, label: "Every Tue")

    /// The profile from `profile-get.json`.
    static func profiles() -> FakeProfileRepository {
        let profile = try? JSONDecoder.api().decode(ProfileResponse.self, from: ContractExamples.example("profile-get.json")).profile
        return FakeProfileRepository(profile: profile)
    }

    @MainActor
    static func until(_ condition: () -> Bool) async {
        for _ in 0..<10_000 where !condition() { await _Concurrency.Task.yield() }
    }

    static func gate() -> (wait: @Sendable () async -> Void, release: () -> Void) {
        let (stream, continuation) = AsyncStream<Void>.makeStream()
        return (
            { for await _ in stream { return } },
            {
                continuation.yield(); continuation.finish()
            }
        )
    }
}
