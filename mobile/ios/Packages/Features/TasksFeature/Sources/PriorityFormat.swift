import Foundation
import Models

/// Michael's ranking in words, mirrored from the web's `src/lib/task-priority-format.ts`: the same reason codes, the
/// same rule for the one-line why, the component labels from `shared/intelligence/prioritization.json`.
enum PriorityFormat {
    /// One component's reason as a short phrase; nil when it says nothing worth showing.
    static func reason(_ reason: PriorityReason) -> String? {
        phrases[reason.code]?(reason)
    }

    private static func number(_ reason: PriorityReason, _ key: String) -> Int { Int(reason.numbers[key] ?? 0) }

    private static let phrases: [String: (PriorityReason) -> String] = [
        "PRIORITY": { reason in
            let priority = reason.strings["priority"].flatMap { TaskPriority(rawValue: $0.uppercased()) } ?? .medium
            return String(localized: "tasks.why.priority \(TaskFormat.priority(priority))", bundle: .module)
        },
        "OVERDUE": { String(localized: "tasks.why.overdue \(number($0, "days"))", bundle: .module) },
        "DUE_TODAY": { _ in String(localized: "tasks.why.dueToday", bundle: .module) },
        "DUE_IN": { String(localized: "tasks.why.dueIn \(inDays(number($0, "days")))", bundle: .module) },
        "NO_DUE_DATE": { _ in String(localized: "tasks.why.noDueDate", bundle: .module) },
        "SUPPORTS_GOALS": { reason in
            let goals = String(localized: "tasks.why.supportsGoals \(number(reason, "count"))", bundle: .module)
            guard let target = reason.numbers["nearestTargetInDays"] else { return goals }
            return String(localized: "tasks.why.supportsGoalsTarget \(goals) \(inDays(Int(target)))", bundle: .module)
        },
        "NOT_ALIGNED": { _ in String(localized: "tasks.why.notAligned", bundle: .module) },
        "BLOCKS_TASKS": { String(localized: "tasks.why.blocks \(number($0, "count"))", bundle: .module) },
        "BLOCKS_NOTHING": { _ in String(localized: "tasks.why.blocksNothing", bundle: .module) },
        "EFFORT_VS_TIME": { reason in
            let minutes = String(localized: "tasks.why.minutes \(number(reason, "minutes"))", bundle: .module)
            let days = String(localized: "tasks.why.days \(number(reason, "daysLeft"))", bundle: .module)
            return String(localized: "tasks.why.effort \(minutes) \(days)", bundle: .module)
        },
        "NO_ESTIMATE": { _ in String(localized: "tasks.why.noEstimate", bundle: .module) },
        "POSTPONED": { String(localized: "tasks.why.postponed \(number($0, "count"))", bundle: .module) },
        "NEVER_POSTPONED": { _ in String(localized: "tasks.why.neverPostponed", bundle: .module) },
        "WAITING_ON_BLOCKERS": { String(localized: "tasks.why.waiting \(number($0, "count"))", bundle: .module) },
        "STATUS_BLOCKED": { _ in String(localized: "tasks.why.statusBlocked", bundle: .module) },
    ]

    /// The two reasons that lifted the task most. A blocked task leads with what it waits on, since that is why it sits low.
    static func why(_ item: RankedTask) -> String {
        let top = item.components
            .filter { $0.applicable && ($0.contribution ?? 0) > 0 }
            .sorted { ($0.contribution ?? 0) > ($1.contribution ?? 0) }
            .prefix(2)
            .compactMap { reason($0.reason) }
        let parts = (item.blockedReason.flatMap(reason).map { [$0] } ?? []) + top
        return parts.isEmpty ? String(localized: "tasks.why.none", bundle: .module) : parts.joined(separator: " · ")
    }

    struct Row: Equatable {
        let label: String
        let reason: String
        let points: Double?
    }

    /// Every component in published order.
    static func breakdown(_ item: RankedTask) -> [Row] {
        item.components.map { component in
            let text =
                reason(component.reason) ?? (component.applicable ? "" : String(localized: "tasks.why.doesNotApply", bundle: .module))
            return Row(label: label(component.name), reason: text, points: component.applicable ? component.contribution : nil)
        }
    }

    static func label(_ name: String) -> String {
        switch name {
        case "user_priority": String(localized: "tasks.component.userPriority", bundle: .module)
        case "due_proximity": String(localized: "tasks.component.dueProximity", bundle: .module)
        case "goal_alignment": String(localized: "tasks.component.goalAlignment", bundle: .module)
        case "blocking_impact": String(localized: "tasks.component.blockingImpact", bundle: .module)
        case "effort_vs_time_left": String(localized: "tasks.component.effort", bundle: .module)
        case "postponement_history": String(localized: "tasks.component.postponed", bundle: .module)
        default: name
        }
    }

    private static func inDays(_ days: Int) -> String {
        switch days {
        case 0: String(localized: "tasks.why.today", bundle: .module)
        case 1: String(localized: "tasks.why.tomorrow", bundle: .module)
        case ..<0: String(localized: "tasks.why.daysAgo \(-days)", bundle: .module)
        default: String(localized: "tasks.why.inDays \(days)", bundle: .module)
        }
    }
}
