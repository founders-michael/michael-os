import Foundation
import TestSupport
import Testing

@testable import Models

struct DecodingTests {
    private let decoder = JSONDecoder.api()

    private func decode<T: Decodable>(_ type: T.Type, example name: String) throws -> T {
        try decoder.decode(type, from: try ContractExamples.example(name))
    }

    @Test func signIn() throws {
        let response = try decode(SignInResponse.self, example: "auth-sign-in.json")
        #expect(response.user.email == "sam@example.test")
        #expect(response.user.emailVerified)
        #expect(response.user.image == nil)
    }

    @Test func session() throws {
        let session = try #require(try decode(AuthSession?.self, example: "auth-get-session.json"))
        #expect(session.session.userId == session.user.id)
        #expect(try decode(AuthSession?.self, example: "auth-get-session-signed-out.json") == nil)
    }

    @Test func signUpAndResend() throws {
        #expect(try decode(SignUpResponse.self, example: "auth-sign-up.json").user.emailVerified == false)
        #expect(try decode(StatusResponse.self, example: "auth-send-verification-email.json").status)
    }

    @Test func signOut() throws {
        #expect(try decode(SignOutResponse.self, example: "auth-sign-out.json").success)
    }

    @Test(arguments: ["profile-get.json", "profile-patch.json", "profile-complete.json"])
    func profile(example: String) throws {
        let profile = try #require(try decode(ProfileResponse.self, example: example).profile)
        #expect(profile.wakeUpTime == LocalTime("07:00"))
        #expect(profile.workStartTime == LocalTime("09:30"))
        #expect(profile.workDays == [.monday, .tuesday, .wednesday, .thursday, .friday])
        #expect(profile.planningStyle == .balanced)
    }

    @Test func profileBeforeOnboarding() throws {
        #expect(try decode(ProfileResponse.self, example: "profile-get-null.json").profile == nil)
    }

    @Test func taskPage() throws {
        let page = try decode(TaskPage.self, example: "tasks-list.json")
        #expect(page.tasks.count == 3)
        #expect(page.total == 3)
        #expect(page.tasks.map(\.title).contains("Review the API contract ✅ — naïve café"))
    }

    @Test(arguments: ["task-get.json", "task-create.json", "task-patch.json"])
    func task(example: String) throws {
        let task = try decode(TaskResponse.self, example: example).task
        #expect(task.title == "Draft the onboarding copy")
        #expect(task.priority == .high)
        #expect(task.dueDate != nil)
    }

    @Test func myDay() throws {
        let day = try decode(MyDay.self, example: "my-day.json")
        #expect(day.today == LocalDate("2026-11-17"))
        #expect(day.selectedDate == day.today)
        #expect(day.timeZone == "Asia/Kolkata")
        #expect(day.greeting == "Good evening")
        #expect(day.greetingName == "Sam")
        #expect(day.briefing == "1 task is due today. Your day is ready for a steady start.")
        #expect(day.notices.isEmpty)
        #expect(day.timeline == [])
        #expect(day.timelineTruncated == false)

        let tasks = try #require(day.tasks)
        #expect(tasks.summary.dueToday == 1)
        #expect(tasks.dailySummary.total == 3)
        #expect(tasks.dailySummary.inProgress == 1)
        #expect(tasks.dailyTasks.map(\.statusAtSelectedDate) == [.todo, .todo, .inProgress])
        #expect(tasks.dailyTasks[0].completionAtSelectedDate == nil)
        #expect(tasks.dailyTasks[0].activityAtSelectedDate != nil)
        #expect(tasks.sections.today.map(\.task.title) == ["Draft the onboarding copy"])
        #expect(tasks.sections.backlog.count == 2)
        #expect(tasks.sections.overdue.isEmpty)

        let habits = try #require(day.habits)
        #expect(habits.summary.completedToday == 1)
        let walk = try #require(habits.habits.first)
        #expect(walk.title == "Evening walk")
        #expect(walk.frequency == .daily)
        #expect(walk.status == .active)
        #expect(walk.startTime == LocalTime("19:00"))
        #expect(walk.completedToday)
        #expect(walk.checkIns.map(\.localDate) == [LocalDate("2026-11-17")])
    }

    @Test func myDayNoticesAndTimeline() throws {
        let json = """
            {"today":"2026-11-17","selectedDate":"2026-11-16","timeZone":"Asia/Kolkata","greeting":"Good morning",
             "greetingName":"Sam","briefing":null,"tasks":null,"habits":null,"timelineTruncated":true,
             "notices":[{"id":"overdue","tone":"warn","tag":"Overdue tasks","text":"2 tasks are past their due date.",
               "actionLabel":"Decide what to do","prompt":"Help me decide."},
              {"id":"later","tone":"celebrate","tag":"New","text":"A tone this build does not know.","actionLabel":"Open"}],
             "timeline":[{"id":"e1","kind":"focus","label":"Focus session","title":"Write","description":null,
               "startAt":"2026-11-16T04:30:00.000Z","endAt":"2026-11-16T05:20:00.000Z","timeZone":"Asia/Kolkata",
               "taskId":"t1","taskTitle":"Write"},
              {"id":"e2","kind":"travel","label":"Travel","title":"Airport","startAt":"2026-11-16T06:00:00Z",
               "endAt":"2026-11-16T07:00:00Z","timeZone":"Asia/Kolkata"}]}
            """
        let day = try decoder.decode(MyDay.self, from: Data(json.utf8))
        #expect(day.tasks == nil)
        #expect(day.habits == nil)
        #expect(day.briefing == nil)
        #expect(day.notices.map(\.tone) == [.warn, .unknown])
        #expect(day.notices[0].prompt == "Help me decide.")
        #expect(day.notices[1].prompt == nil)
        #expect(day.timeline?.map(\.kind) == [.focus, .unknown])
        #expect(day.timeline?[1].taskId == nil)
        #expect(day.timelineTruncated == true)
    }

    @Test func habitCheckIns() throws {
        let first = try decode(CheckInResponse.self, example: "habit-check-in.json")
        #expect(!first.alreadyCompleted)
        #expect(first.checkIn.localDate == LocalDate("2026-11-17"))
        let repeated = try decode(CheckInResponse.self, example: "habit-check-in-repeat.json")
        #expect(repeated.alreadyCompleted)
        #expect(repeated.checkIn == first.checkIn)
        #expect(try decode(SuccessResponse.self, example: "habit-check-in-delete.json").success)
    }

    @Test func taskUpdateSendsOnlyTheStatus() throws {
        let body = try JSONEncoder().encode(TaskUpdate(status: .completed))
        #expect(String(bytes: body, encoding: .utf8) == #"{"status":"COMPLETED"}"#)
        let checkIn = try JSONEncoder().encode(CheckInRequest(localDate: try #require(LocalDate("2026-11-17"))))
        #expect(String(bytes: checkIn, encoding: .utf8) == #"{"localDate":"2026-11-17"}"#)
    }

    @Test func localDateArithmetic() throws {
        let date = try #require(LocalDate("2026-03-01"))
        #expect(date.adding(days: -1) == LocalDate("2026-02-28"))
        #expect(try #require(LocalDate("2024-02-28")).adding(days: 1) == LocalDate("2024-02-29"))
        #expect(try #require(LocalDate("2026-12-31")).adding(days: 1) == LocalDate("2027-01-01"))
        #expect(date.adding(days: 0) == date)
    }

    @Test func unknownEnumValueDecodesToUnknown() throws {
        let json = Self.task(status: "\"ARCHIVED\"", extra: "")
        let task = try decoder.decode(Task.self, from: Data(json.utf8))
        #expect(task.status == .unknown)
    }

    @Test func missingOptionalFieldDecodesToNil() throws {
        let json = """
            {"id":"t1","title":"Call the bank","status":"TODO","priority":"LOW",
             "createdAt":"2026-11-17T14:59:47.113Z","updatedAt":"2026-11-17T14:59:47Z"}
            """
        let task = try decoder.decode(Task.self, from: Data(json.utf8))
        #expect(task.description == nil)
        #expect(task.dueDate == nil)
        #expect(task.estimatedDurationMinutes == nil)
    }

    @Test func extraFieldIsIgnored() throws {
        let json = Self.task(status: "\"COMPLETED\"", extra: #","labels":["new"],"nested":{"a":1}"#)
        #expect(try decoder.decode(Task.self, from: Data(json.utf8)).status == .completed)
    }

    @Test func instantsAcceptOffsetsAndWholeSeconds() throws {
        let instants = try decoder.decode(
            [Date].self,
            from: Data(#"["2026-11-17T14:59:44.808Z","2026-11-17T14:59:44Z","2026-11-17T20:29:44.808+05:30"]"#.utf8)
        )
        #expect(instants[0] == instants[2])
        #expect(abs(instants[0].timeIntervalSince(instants[1]) - 0.808) < 0.001)
    }

    @Test func localDateIsStrict() {
        #expect(LocalDate("2026-11-17")?.description == "2026-11-17")
        for text in ["2026-13-01", "2026-1-01", "20261117", "2026-11-17T00:00:00Z", ""] {
            #expect(LocalDate(text) == nil, "\(text)")
        }
        #expect(LocalTime("24:00") == nil)
        #expect(LocalTime("7:00") == nil)
    }

    private static func task(status: String, extra: String) -> String {
        """
        {"id":"t1","userId":"u1","title":"Call the bank","description":null,"status":\(status),"priority":"HIGH",
         "estimatedDurationMinutes":null,"remainingDurationMinutes":null,"dueDate":"2026-11-18","completedAt":null,
         "createdAt":"2026-11-17T14:59:47.113Z","updatedAt":"2026-11-17T14:59:47.113Z"\(extra)}
        """
    }
}
