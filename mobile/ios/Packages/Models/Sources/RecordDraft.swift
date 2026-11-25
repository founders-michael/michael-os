import Foundation

public enum DraftKind: String, OpenEnum {
    case task
    case goal
    case habit
    case calendarEvent
    case memory
    case unknown
}

/// A value Michael filled in. The draft tools normalise every value to one of these shapes.
public enum DraftValue: Equatable, Sendable {
    case text(String)
    case number(Int)
    case days([Int])
}

/// An unsaved record Michael proposed. Nothing is saved until the user presses Save, which posts the edited
/// values to the kind's own create endpoint.
public struct RecordDraft: Decodable, Equatable, Sendable {
    public let kind: DraftKind
    public let values: [String: DraftValue]
    public let timeZone: String

    public init(kind: DraftKind, values: [String: DraftValue], timeZone: String) {
        self.kind = kind
        self.values = values
        self.timeZone = timeZone
    }

    private enum CodingKeys: String, CodingKey {
        case kind, values, timeZone
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        kind = try container.decode(DraftKind.self, forKey: .kind)
        timeZone = try container.decode(String.self, forKey: .timeZone)
        let fields = try container.nestedContainer(keyedBy: AnyKey.self, forKey: .values)
        var values: [String: DraftValue] = [:]
        // A value of a shape this build does not know leaves its field empty for the user to fill in, rather than
        // failing the whole reply.
        for key in fields.allKeys {
            if let text = try? fields.decode(String.self, forKey: key) {
                values[key.stringValue] = .text(text)
            } else if let number = try? fields.decode(Int.self, forKey: key) {
                values[key.stringValue] = .number(number)
            } else if let days = try? fields.decode([Int].self, forKey: key) {
                values[key.stringValue] = .days(days)
            }
        }
        self.values = values
    }

    private struct AnyKey: CodingKey {
        let stringValue: String
        let intValue: Int? = nil

        init(stringValue: String) {
            self.stringValue = stringValue
        }

        init?(intValue: Int) {
            nil
        }
    }
}

/// A schedule draft from the planner. Phase 8 applies it; until then the chat only points to Calendar.
public struct PlanningProposal: Decodable, Equatable, Sendable {
    public init() {}
}
