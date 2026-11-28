import Foundation

/// `POST /api/calendar/plan` and the chat's `planningProposal`: sessions the planner suggests, none of them saved.
/// `approvalToken` is the only thing that can apply them; it is kept in memory with the proposal and never logged.
public struct PlanningProposal: Decodable, Equatable, Sendable {
    public let timeZone: String
    public let proposedActivities: [ProposedSession]
    public let taskDetails: [PlannedTask]
    public let unscheduledTasks: [UnplannedTask]
    public let warnings: [PlanWarning]
    public let approvalToken: String
    public let approvalExpiresAt: Date

    public init(
        timeZone: String,
        proposedActivities: [ProposedSession],
        taskDetails: [PlannedTask],
        unscheduledTasks: [UnplannedTask] = [],
        warnings: [PlanWarning] = [],
        approvalToken: String,
        approvalExpiresAt: Date
    ) {
        self.timeZone = timeZone
        self.proposedActivities = proposedActivities
        self.taskDetails = taskDetails
        self.unscheduledTasks = unscheduledTasks
        self.warnings = warnings
        self.approvalToken = approvalToken
        self.approvalExpiresAt = approvalExpiresAt
    }
}

public struct ProposedSession: Decodable, Equatable, Sendable, Identifiable {
    /// What the apply call names; the created event takes it as its id.
    public let selectionId: String
    public let taskId: String
    public let startAt: Date
    public let endAt: Date
    public let sessionIndex: Int
    public let sessionCount: Int

    public var id: String { selectionId }

    public init(selectionId: String, taskId: String, startAt: Date, endAt: Date, sessionIndex: Int = 1, sessionCount: Int = 1) {
        self.selectionId = selectionId
        self.taskId = taskId
        self.startAt = startAt
        self.endAt = endAt
        self.sessionIndex = sessionIndex
        self.sessionCount = sessionCount
    }
}

public struct PlannedTask: Decodable, Equatable, Sendable {
    public let id: String
    public let title: String

    public init(id: String, title: String) {
        self.id = id
        self.title = title
    }
}

/// A task the planner could not place. `reason` is a sentence for the user.
public struct UnplannedTask: Decodable, Equatable, Sendable {
    public let taskId: String
    public let reasonCode: String
    public let reason: String

    public init(taskId: String, reasonCode: String, reason: String) {
        self.taskId = taskId
        self.reasonCode = reasonCode
        self.reason = reason
    }
}

/// `message` is a sentence for the user; `code` decides behaviour.
public struct PlanWarning: Decodable, Equatable, Sendable {
    public let code: String
    public let message: String

    public init(code: String, message: String) {
        self.code = code
        self.message = message
    }
}

public struct PlanningProposalResponse: Decodable, Sendable {
    public let proposal: PlanningProposal
}

/// `POST /api/calendar/plan`: up to seven dates, starting today or later.
public struct PlanRequest: Encodable, Equatable, Sendable {
    public let fromDate: LocalDate
    public let toDate: LocalDate

    public init(fromDate: LocalDate, toDate: LocalDate) {
        self.fromDate = fromDate
        self.toDate = toDate
    }
}

public struct PlanApply: Encodable, Equatable, Sendable {
    public let approvalToken: String
    public let selectedSessionIds: [String]

    public init(approvalToken: String, selectedSessionIds: [String]) {
        self.approvalToken = approvalToken
        self.selectedSessionIds = selectedSessionIds
    }
}

public struct PlanApplyResult: Decodable, Equatable, Sendable {
    public let createdCount: Int

    public init(createdCount: Int) {
        self.createdCount = createdCount
    }
}

public struct PlanApplyResponse: Decodable, Sendable {
    public let result: PlanApplyResult
}
