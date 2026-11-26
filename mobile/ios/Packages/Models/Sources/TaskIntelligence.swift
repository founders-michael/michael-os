import Foundation

/// One open task in Michael's order (`GET /api/tasks/priorities`). The ranking never edits a task.
public struct RankedTask: Decodable, Equatable, Sendable, Identifiable {
    public let rank: Int
    public let score: Double
    /// False when the task waits on unfinished work; such tasks come after the ones that can start now.
    public let actionable: Bool
    public let blockedReason: PriorityReason?
    public let components: [PriorityComponent]
    public let task: Task

    public var id: Task.ID { task.id }

    public init(rank: Int, score: Double, actionable: Bool, blockedReason: PriorityReason?, components: [PriorityComponent], task: Task) {
        self.rank = rank
        self.score = score
        self.actionable = actionable
        self.blockedReason = blockedReason
        self.components = components
        self.task = task
    }
}

/// One part of the published formula (`shared/intelligence/prioritization.json`) and what it found for this task.
public struct PriorityComponent: Decodable, Equatable, Sendable {
    public let name: String
    public let applicable: Bool
    public let weight: Double
    public let contribution: Double?
    public let reason: PriorityReason
}

/// A reason code with the values its wording needs (`days`, `count`, `priority`, ...). The fields vary by code.
public struct PriorityReason: Decodable, Equatable, Sendable {
    public let code: String
    public let numbers: [String: Double]
    public let strings: [String: String]

    public init(code: String, numbers: [String: Double] = [:], strings: [String: String] = [:]) {
        self.code = code
        self.numbers = numbers
        self.strings = strings
    }

    private struct Key: CodingKey {
        let stringValue: String
        var intValue: Int? { nil }
        init(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { nil }
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: Key.self)
        code = try container.decode(String.self, forKey: Key(stringValue: "code"))
        var numbers: [String: Double] = [:]
        var strings: [String: String] = [:]
        for key in container.allKeys where key.stringValue != "code" {
            if let number = try? container.decode(Double.self, forKey: key) {
                numbers[key.stringValue] = number
            } else if let text = try? container.decode(String.self, forKey: key) {
                strings[key.stringValue] = text
            }
        }
        self.numbers = numbers
        self.strings = strings
    }
}

public struct PrioritiesPage: Decodable, Equatable, Sendable {
    public let tasks: [RankedTask]
    public let page: Int
    public let pages: Int
    public let total: Int
    public let openTasks: Int
    public let truncated: Bool
}

/// A goal a task supports, as `GET /api/tasks/{id}/goals` returns it.
public struct GoalLink: Decodable, Equatable, Sendable, Identifiable {
    public let id: String
    public let title: String
    public let status: GoalStatus
    public let targetDate: LocalDate?

    public init(id: String, title: String, status: GoalStatus, targetDate: LocalDate?) {
        self.id = id
        self.title = title
        self.status = status
        self.targetDate = targetDate
    }
}

public struct GoalLinks: Decodable, Equatable, Sendable {
    public let goals: [GoalLink]
}

public struct GoalLinksUpdate: Encodable, Equatable, Sendable {
    public let goalIds: [String]

    public init(goalIds: [String]) {
        self.goalIds = goalIds
    }
}

public struct GoalList: Decodable, Equatable, Sendable {
    public let goals: [Goal]
}

/// A category in the registry (`/api/taxonomy`). `entityTypes` says which records it may hold.
public struct TaxonomyCategory: Decodable, Equatable, Sendable, Identifiable {
    public let key: String
    public let name: String
    public let entityTypes: [String]

    public var id: String { key }

    public init(key: String, name: String, entityTypes: [String]) {
        self.key = key
        self.name = name
        self.entityTypes = entityTypes
    }
}

public struct TaxonomyResponse: Decodable, Equatable, Sendable {
    public let categories: [TaxonomyCategory]
}

/// One record placed in one category. `inferred` marks Michael's suggestion, which stays one until confirmed.
public struct Classification: Decodable, Equatable, Sendable, Identifiable {
    public struct Category: Decodable, Equatable, Sendable {
        public let key: String
        public let name: String
        public let active: Bool

        public init(key: String, name: String, active: Bool) {
            self.key = key
            self.name = name
            self.active = active
        }
    }

    public let id: String
    public let category: Category
    public let inferred: Bool
    public let confidence: Double?

    public init(id: String, category: Category, inferred: Bool, confidence: Double?) {
        self.id = id
        self.category = category
        self.inferred = inferred
        self.confidence = confidence
    }
}

public struct ClassificationList: Decodable, Equatable, Sendable {
    public let classifications: [Classification]
}

public struct ClassificationResponse: Decodable, Equatable, Sendable {
    public let classification: Classification
}

/// Null when Michael found no category that clearly fits.
public struct SuggestionResponse: Decodable, Equatable, Sendable {
    public let suggestion: Classification?
}

public struct ClassificationCreate: Encodable, Equatable, Sendable {
    public let entityType = "TASK"
    public let entityId: String
    public let categoryKey: String

    public init(entityId: String, categoryKey: String) {
        self.entityId = entityId
        self.categoryKey = categoryKey
    }
}

public struct SuggestionRequest: Encodable, Equatable, Sendable {
    public let entityType = "TASK"
    public let entityId: String
    public let dataUseAcknowledged: Bool

    public init(entityId: String, dataUseAcknowledged: Bool) {
        self.entityId = entityId
        self.dataUseAcknowledged = dataUseAcknowledged
    }
}
