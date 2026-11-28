import Foundation

public struct Goal: Decodable, Equatable, Sendable, Identifiable {
    public let id: String
    public let title: String
    public let description: String?
    public let category: String?
    public let status: GoalStatus
    /// The user's own estimate. Milestones never move it.
    public let progress: Int
    public let targetDate: LocalDate?
    public let completedAt: Date?
    /// In the server's order, by position.
    public let milestones: [GoalMilestone]
    public let milestoneCount: Int
    public let completedMilestoneCount: Int
    public let createdAt: Date
    public let updatedAt: Date

    public init(
        id: String, title: String, description: String?, category: String?, status: GoalStatus, progress: Int, targetDate: LocalDate?,
        completedAt: Date?, milestones: [GoalMilestone] = [], milestoneCount: Int, completedMilestoneCount: Int, createdAt: Date,
        updatedAt: Date
    ) {
        self.id = id
        self.title = title
        self.description = description
        self.category = category
        self.status = status
        self.progress = progress
        self.targetDate = targetDate
        self.completedAt = completedAt
        self.milestones = milestones
        self.milestoneCount = milestoneCount
        self.completedMilestoneCount = completedMilestoneCount
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public enum GoalStatus: String, OpenEnum {
    case active = "ACTIVE"
    case completed = "COMPLETED"
    case archived = "ARCHIVED"
    case unknown
}

public struct GoalMilestone: Decodable, Equatable, Sendable, Identifiable {
    public let id: String
    public let title: String
    public let description: String?
    public let status: MilestoneStatus
    public let position: Int
    public let completedAt: Date?

    public init(id: String, title: String, description: String?, status: MilestoneStatus, position: Int, completedAt: Date?) {
        self.id = id
        self.title = title
        self.description = description
        self.status = status
        self.position = position
        self.completedAt = completedAt
    }
}

public enum MilestoneStatus: String, OpenEnum {
    case pending = "PENDING"
    case completed = "COMPLETED"
    case unknown
}

public struct GoalResponse: Decodable, Equatable, Sendable {
    public let goal: Goal
}

/// A milestone call answers with the bare row, which also carries `goalId`.
public struct MilestoneResponse: Decodable, Equatable, Sendable {
    public let milestone: GoalMilestone
}

/// `GET /api/goals/summary`, read for the server's "today" in the profile's zone.
public struct GoalSummaryResponse: Decodable, Equatable, Sendable {
    public struct Summary: Decodable, Equatable, Sendable {
        public let today: LocalDate
    }

    public let summary: Summary
}

/// `POST /api/goals` from a Michael draft.
public struct GoalCreate: Encodable, Equatable, Sendable {
    public let title: String
    public let description: String?
    public let category: String?
    public let targetDate: LocalDate?
    public let progress: Int

    public init(title: String, description: String?, category: String?, targetDate: LocalDate?, progress: Int) {
        self.title = title
        self.description = description
        self.category = category
        self.targetDate = targetDate
        self.progress = progress
    }
}

/// The goal form's save, for `POST /api/goals` and `PATCH /api/goals/{id}`. Empty fields are sent as null so clearing
/// reaches the server; progress is left out for a completed goal, which the server would refuse.
public struct GoalSave: Encodable, Equatable, Sendable {
    public let title: String
    public let description: String?
    public let category: String?
    public let targetDate: LocalDate?
    public let progress: Int?

    public init(title: String, description: String?, category: String?, targetDate: LocalDate?, progress: Int?) {
        self.title = title
        self.description = description
        self.category = category
        self.targetDate = targetDate
        self.progress = progress
    }

    private enum CodingKeys: String, CodingKey { case title, description, category, targetDate, progress }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(title, forKey: .title)
        try container.encode(description, forKey: .description)
        try container.encode(category, forKey: .category)
        try container.encode(targetDate, forKey: .targetDate)
        try container.encodeIfPresent(progress, forKey: .progress)
    }
}

/// `PATCH /api/goals/{id}` with one change: a status, or progress.
public struct GoalChange: Encodable, Equatable, Sendable {
    public let status: GoalStatus?
    public let progress: Int?

    public static func status(_ status: GoalStatus) -> GoalChange { GoalChange(status: status, progress: nil) }
    public static func progress(_ progress: Int) -> GoalChange { GoalChange(status: nil, progress: progress) }
}

public struct MilestoneCreate: Encodable, Equatable, Sendable {
    public let title: String

    public init(title: String) {
        self.title = title
    }
}

/// `PATCH /api/goals/{id}/milestones/{milestoneId}` with one change.
public struct MilestoneChange: Encodable, Equatable, Sendable {
    public let title: String?
    public let status: MilestoneStatus?
    public let position: Int?

    public static func title(_ title: String) -> MilestoneChange { MilestoneChange(title: title, status: nil, position: nil) }
    public static func status(_ status: MilestoneStatus) -> MilestoneChange { MilestoneChange(title: nil, status: status, position: nil) }
    public static func position(_ position: Int) -> MilestoneChange { MilestoneChange(title: nil, status: nil, position: position) }
}
