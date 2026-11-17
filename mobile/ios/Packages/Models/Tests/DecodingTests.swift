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
