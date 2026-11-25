import Foundation

/// How each assistant tool is named to the user, mirrored from the web app's src/lib/ai/tool-labels.ts for the
/// LifestyleOS tools. `label` names a source in a finished reply, `doing` is the live line while it runs, and
/// `detail` says what the tool can see. The words live in the string catalogue under `tool.<name>.*`.
struct ToolLabel: Equatable {
    enum Kind: Equatable {
        case read, draft, plan
    }

    let label: String
    let doing: String
    let detail: String
    let kind: Kind

    static let kinds: [String: Kind] = [
        "get_my_tasks": .read,
        "get_my_goals": .read,
        "get_my_context": .read,
        "get_my_memories": .read,
        "draft_memory": .draft,
        "get_my_habits": .read,
        "get_my_calendar": .read,
        "get_daily_overview": .read,
        "get_daily_review": .read,
        "get_task_priorities": .read,
        "prepare_schedule_proposal": .plan,
        "draft_task": .draft,
        "draft_goal": .draft,
        "draft_habit": .draft,
        "draft_calendar_event": .draft,
    ]

    /// A tool this build does not know is described generically rather than by its internal name.
    static func of(_ name: String) -> ToolLabel {
        guard let kind = kinds[name] else {
            return ToolLabel(
                label: String(localized: "tool.unknown.label", bundle: .module),
                doing: String(localized: "tool.unknown.doing", bundle: .module),
                detail: String(localized: "tool.unknown.detail", bundle: .module),
                kind: .read
            )
        }
        return ToolLabel(
            label: localizedKey("tool.\(name).label"),
            doing: localizedKey("tool.\(name).doing"),
            detail: localizedKey("tool.\(name).detail"),
            kind: kind
        )
    }
}
