import Foundation
import Models

/// The two names the user may change. Rules mirror `account-validation.ts`; the server checks them again.
struct AccountForm: Equatable {
    static let nameLimit = 80

    enum Problem: Equatable {
        case missing, tooLong
    }

    var fullName: String
    var preferredName: String

    init(_ account: Account) {
        fullName = account.fullName
        preferredName = account.preferredName
    }

    /// Runs of spaces become one and the ends are trimmed, as the server stores it.
    static func normalized(_ name: String) -> String {
        name.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    static func problem(_ name: String) -> Problem? {
        let name = normalized(name)
        if name.isEmpty { return .missing }
        return name.count > nameLimit ? .tooLong : nil
    }

    var save: AccountUpdate? {
        guard Self.problem(fullName) == nil, Self.problem(preferredName) == nil else { return nil }
        return AccountUpdate(fullName: Self.normalized(fullName), preferredName: Self.normalized(preferredName))
    }
}

/// My Context as the editor holds it, with the version it was loaded at.
struct ContextDraft: Equatable {
    static let limit = 5000

    var text: String
    let version: String?

    init(_ context: PersonalContext) {
        text = context.summary
        version = context.version
    }

    /// What the server stores and counts: Windows line endings become `\n`, trailing space is dropped.
    static func normalized(_ text: String) -> String {
        let unix = text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        guard let last = unix.lastIndex(where: { !$0.isWhitespace }) else { return "" }
        return String(unix[...last])
    }

    var count: Int { Self.normalized(text).count }
    var isTooLong: Bool { count > Self.limit }

    func save(over version: String?) -> PersonalContextSave {
        PersonalContextSave(summary: Self.normalized(text), expectedUpdatedAt: version)
    }
}

extension PersonalContext {
    var version: String? { updatedAt }
}

/// Deleting the account asks for the password and for this word typed exactly.
enum DeleteConfirmation {
    static let word = "DELETE"

    static func isReady(password: String, typed: String) -> Bool {
        !password.isEmpty && typed == word
    }
}

/// The routine as Settings edits it. Rules mirror `profile-validation.ts`; the server checks them again.
struct RoutineForm: Equatable {
    static let priorityLimit = 3
    static let priorityLength = 100
    static let focusRange = 15...180
    static let breakRange = 0...60
    static let minuteStep = 5
    static let week: [DayOfWeek] = [.monday, .tuesday, .wednesday, .thursday, .friday, .saturday, .sunday]
    // Offered when work hours are switched on; nothing is stored until the user saves.
    static let defaultWorkStart = LocalTime(hour: 9, minute: 0)
    static let defaultWorkEnd = LocalTime(hour: 18, minute: 0)

    enum PriorityProblem: Equatable {
        case empty, tooLong, duplicate, full
    }

    var timeZone: String
    var wakeUpTime: LocalTime
    var bedtime: LocalTime
    var hasWorkHours: Bool
    var workStartTime: LocalTime
    var workEndTime: LocalTime
    var workDays: [DayOfWeek]
    var priorities: [String]
    var focusSessionMinutes: Int
    var breakDurationMinutes: Int
    var planningStyle: PlanningStyle

    init(_ profile: Profile) {
        timeZone = profile.timeZone
        wakeUpTime = profile.wakeUpTime
        bedtime = profile.bedtime
        hasWorkHours = profile.workStartTime != nil && profile.workEndTime != nil
        workStartTime = profile.workStartTime ?? Self.defaultWorkStart
        workEndTime = profile.workEndTime ?? Self.defaultWorkEnd
        workDays = Self.week.filter(profile.workDays.contains)
        priorities = profile.priorities
        focusSessionMinutes = profile.focusSessionMinutes
        breakDurationMinutes = profile.breakDurationMinutes
        planningStyle = profile.planningStyle == .unknown ? .balanced : profile.planningStyle
    }

    /// Work hours end after they start; overnight work hours are not supported by the server.
    var workHoursProblem: Bool { hasWorkHours && workStartTime >= workEndTime }

    mutating func toggle(_ day: DayOfWeek) {
        if workDays.contains(day) {
            workDays.removeAll { $0 == day }
        } else {
            workDays = Self.week.filter { workDays.contains($0) || $0 == day }
        }
    }

    static func problem(adding text: String, to priorities: [String]) -> PriorityProblem? {
        let priority = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if priority.isEmpty { return .empty }
        if priority.count > priorityLength { return .tooLong }
        if priorities.contains(where: { $0.caseInsensitiveCompare(priority) == .orderedSame }) { return .duplicate }
        return priorities.count >= priorityLimit ? .full : nil
    }

    mutating func addPriority(_ text: String) -> PriorityProblem? {
        if let problem = Self.problem(adding: text, to: priorities) { return problem }
        priorities.append(text.trimmingCharacters(in: .whitespacesAndNewlines))
        return nil
    }

    var save: RoutineUpdate? {
        guard !workHoursProblem else { return nil }
        return RoutineUpdate(
            timeZone: timeZone, wakeUpTime: wakeUpTime, bedtime: bedtime,
            workStartTime: hasWorkHours ? workStartTime : nil, workEndTime: hasWorkHours ? workEndTime : nil,
            workDays: workDays, priorities: priorities, focusSessionMinutes: focusSessionMinutes,
            breakDurationMinutes: breakDurationMinutes, planningStyle: planningStyle
        )
    }
}

/// The weekly availability being edited, checked as the server checks it before it is sent.
struct AvailabilityPlan: Equatable {
    static let limit = 50

    struct Slot: Identifiable, Equatable {
        let id: UUID
        var window: AvailabilityWindow
    }

    enum Problem: Equatable {
        /// The end is not after the start: the window is empty or would cross midnight.
        case order
        /// It overlaps another window on the same weekday. Touching ends are allowed.
        case overlap
    }

    private(set) var slots: [Slot]
    let timeZone: String

    init(_ availability: Availability) {
        timeZone = availability.timeZone
        slots = availability.windows.map { Slot(id: UUID(), window: $0) }
    }

    var windows: [AvailabilityWindow] { slots.map(\.window) }

    func slots(on weekday: Int) -> [Slot] {
        slots.filter { $0.window.weekday == weekday }.sorted { $0.window.startTime < $1.window.startTime }
    }

    func problem(_ id: Slot.ID) -> Problem? {
        guard let slot = slots.first(where: { $0.id == id }) else { return nil }
        let window = slot.window
        if window.startTime >= window.endTime { return .order }
        let overlaps = slots.contains { other in
            other.id != id && other.window.weekday == window.weekday && other.window.timeZone == window.timeZone
                && other.window.startTime < other.window.endTime
                && window.startTime < other.window.endTime && window.endTime > other.window.startTime
        }
        return overlaps ? .overlap : nil
    }

    func problems(on weekday: Int) -> Set<Problem> {
        Set(slots(on: weekday).compactMap { problem($0.id) })
    }

    var canAdd: Bool { slots.count < Self.limit }

    var save: AvailabilityUpdate? {
        guard slots.allSatisfy({ problem($0.id) == nil }) else { return nil }
        return AvailabilityUpdate(windows: windows)
    }

    /// A new window starts where the day's last one ends, or 09:00 to 17:00 on an empty day.
    @discardableResult
    mutating func add(on weekday: Int) -> Slot.ID? {
        guard canAdd else { return nil }
        let last = slots(on: weekday).last?.window.endTime
        let start = last ?? LocalTime(hour: 9, minute: 0)
        let end =
            last.map { LocalTime(hour: 0, minute: min($0.hour * 60 + $0.minute + 120, 23 * 60 + 59)) }
            ?? LocalTime(hour: 17, minute: 0)
        let slot = Slot(id: UUID(), window: AvailabilityWindow(weekday: weekday, startTime: start, endTime: end, timeZone: timeZone))
        slots.append(slot)
        return slot.id
    }

    mutating func update(_ id: Slot.ID, _ change: (inout AvailabilityWindow) -> Void) {
        guard let index = slots.firstIndex(where: { $0.id == id }) else { return }
        change(&slots[index].window)
    }

    mutating func remove(_ id: Slot.ID) {
        slots.removeAll { $0.id == id }
    }
}

/// What the server accepts as a picture, decided by the bytes as `profile-image.ts` does.
enum PictureRules {
    static let maxBytes = 2 * 1024 * 1024
    /// Photos are re-encoded to this size before upload, which also drops their location and camera details.
    static let longestSide: CGFloat = 1024

    static func contentType(of data: Data) -> String? {
        let bytes = [UInt8](data.prefix(12))
        if bytes.starts(with: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) { return "image/png" }
        if bytes.starts(with: [0xFF, 0xD8, 0xFF]) { return "image/jpeg" }
        if bytes.count >= 12, bytes.starts(with: [0x52, 0x49, 0x46, 0x46]), Array(bytes[8..<12]) == [0x57, 0x45, 0x42, 0x50] {
            return "image/webp"
        }
        return nil
    }

    static func isAccepted(_ data: Data) -> Bool {
        !data.isEmpty && data.count <= maxBytes && contentType(of: data) != nil
    }
}
