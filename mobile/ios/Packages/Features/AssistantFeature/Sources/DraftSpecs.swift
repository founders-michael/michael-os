import Foundation
import Models

// The field specs and defaults of src/lib/ai/draft-model.ts. `required` means required to save: it matches the
// create schema's own required set.
extension DraftForm {
    static func specs(_ kind: DraftKind) -> [DraftField] {
        switch kind {
        case .task:
            [
                field("title", .text(maxLength: 160), required: true),
                field("description", .longText(maxLength: 5000)),
                field("priority", .choice(options(["LOW", "MEDIUM", "HIGH"], "priority")), required: true),
                field("dueDate", .date),
                field("estimatedDurationMinutes", .number(min: 5, max: 1440, unit: unit("minutes"))),
            ].map { $0(kind) }
        case .goal:
            [
                field("title", .text(maxLength: 160), required: true),
                field("description", .longText(maxLength: 5000)),
                field("category", .text(maxLength: 80)),
                field("targetDate", .date),
                field("progress", .number(min: 0, max: 100, unit: unit("percent"))),
            ].map { $0(kind) }
        case .habit:
            [
                field("title", .text(maxLength: 160), required: true),
                field("description", .longText(maxLength: 2000)),
                field("frequency", .choice(options(["DAILY", "SELECTED_DAYS"], "frequency")), required: true),
                field("weekdays", .weekdays),
                field("startTime", .time),
                field("endTime", .time),
            ].map { $0(kind) }
        case .calendarEvent:
            [
                field("title", .text(maxLength: 160), required: true),
                field("description", .longText(maxLength: 5000)),
                field("eventType", .choice(options(["COMMITMENT", "UNAVAILABLE"], "eventType")), required: true),
                field("date", .date, required: true),
                field("startTime", .time, required: true),
                field("endTime", .time, required: true),
            ].map { $0(kind) }
        case .memory:
            [
                field("content", .longText(maxLength: 280), required: true),
                field("sensitivity", .choice(options(["STANDARD", "PERSONAL", "SENSITIVE"], "sensitivity")), required: true),
                field("keepUntil", .date),
            ].map { $0(kind) }
        case .unknown:
            []
        }
    }

    /// The defaults the create schemas apply, so the form opens consistent with them.
    static func defaults(_ kind: DraftKind) -> [String: DraftValue] {
        switch kind {
        case .task: ["priority": .text("MEDIUM")]
        case .goal: ["progress": .number(0)]
        case .habit: ["frequency": .text("DAILY"), "weekdays": .days([])]
        case .calendarEvent: ["eventType": .text("COMMITMENT")]
        case .memory: ["sensitivity": .text("STANDARD")]
        case .unknown: [:]
        }
    }

    private static func field(
        _ name: String,
        _ input: DraftField.Input,
        required: Bool = false
    ) -> (DraftKind) -> DraftField {
        { kind in
            DraftField(
                name: name,
                label: localizedKey("draft.field.\(kind.rawValue).\(name)"),
                required: required,
                input: input
            )
        }
    }

    private static func options(_ values: [String], _ group: String) -> [DraftOption] {
        values.map { value in
            DraftOption(
                value: value,
                label: localizedKey("draft.option.\(group).\(value)")
            )
        }
    }

    private static func unit(_ name: String) -> String {
        localizedKey("draft.unit.\(name)")
    }
}
