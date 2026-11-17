import Foundation
import Models
import TestSupport
import Testing

@testable import Networking

struct APIClientTests {
    private actor Credentials: SessionCredentials {
        let token: String?
        private(set) var rejected: [String] = []

        init(token: String?) {
            self.token = token
        }

        func currentToken() -> String? { token }

        func reject(_ token: String) { rejected.append(token) }
    }

    private func client(_ server: StubServer, token: String? = "token-abc", log: LockedLines = LockedLines()) -> (APIClient, Credentials) {
        let credentials = Credentials(token: token)
        let client = APIClient(
            baseURL: server.baseURL,
            credentials: credentials,
            configuration: server.configuration(APIClient.configuration()),
            retryDelay: .zero,
            log: log.append
        )
        return (client, credentials)
    }

    @Test func sendsBearerTokenAndDecodes() async throws {
        let body = try ContractExamples.example("tasks-list.json")
        let server = StubServer { _ in StubResponse(status: 200, body: body) }
        let page = try await client(server).0.send(.get("/api/tasks", query: [URLQueryItem(name: "page", value: "1")])).value as TaskPage
        #expect(page.tasks.count == 3)
        let request = try #require(server.requests.first)
        #expect(request.url?.path() == "/api/tasks")
        #expect(request.url?.query() == "page=1")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer token-abc")
        for header in ["Origin", "Referer", "Sec-Fetch-Mode", "Sec-Fetch-Site", "Cookie"] {
            #expect(request.value(forHTTPHeaderField: header) == nil, "\(header)")
        }
    }

    @Test func storesNoCookies() async throws {
        let server = StubServer { _ in
            StubResponse(
                status: 200, headers: ["Set-Cookie": "better-auth.session_token=abc; Path=/; HttpOnly"], json: #"{"success":true}"#)
        }
        let (client, _) = client(server, token: nil)
        _ = try await client.send(.get("/api/auth/ok") as APIRequest<SignOutResponse>)
        _ = try await client.send(.get("/api/auth/ok") as APIRequest<SignOutResponse>)
        #expect(server.requests.count == 2)
        #expect(server.requests.allSatisfy { $0.value(forHTTPHeaderField: "Cookie") == nil })
        #expect(APIClient.configuration().httpCookieStorage == nil)
    }

    @Test func readsAreRetriedTwiceThenSucceed() async throws {
        let calls = LockedLines()
        let server = StubServer { _ in
            calls.append("call")
            return calls.all.count < 3 ? StubResponse(status: 503) : StubResponse(status: 200, json: #"{"success":true}"#)
        }
        _ = try await client(server).0.send(.get("/x") as APIRequest<SignOutResponse>)
        #expect(server.requests.count == 3)
    }

    @Test func readsGiveUpAfterTwoRetries() async {
        let server = StubServer { _ in StubResponse(status: 502, body: Data("<html>".utf8)) }
        await #expect(throws: AppError.server(ServerMessage())) {
            _ = try await client(server).0.send(.get("/x") as APIRequest<SignOutResponse>)
        }
        #expect(server.requests.count == 3)
    }

    @Test func writesAreNeverRetried() async throws {
        let server = StubServer { _ in StubResponse(status: 503) }
        let request = try APIRequest<SignOutResponse>.post("/api/auth/sign-out", body: EmptyBody())
        await #expect(throws: AppError.self) { _ = try await client(server).0.send(request) }
        #expect(server.requests.count == 1)
    }

    @Test func clientErrorsAreNotRetried() async {
        let server = StubServer { _ in StubResponse(status: 404, json: #"{"error":"Task not found."}"#) }
        await #expect(throws: AppError.notFound(ServerMessage(text: "Task not found."))) {
            _ = try await client(server).0.send(.get("/api/tasks/x") as APIRequest<TaskResponse>)
        }
        #expect(server.requests.count == 1)
    }

    @Test func unauthorizedReportsTheTokenThatWasRefused() async throws {
        let body = try ContractExamples.example("tasks-list-401.json")
        let server = StubServer { _ in StubResponse(status: 401, body: body) }
        let (client, credentials) = client(server)
        await #expect(throws: AppError.unauthorized(ServerMessage(text: "Sign in to access tasks."))) {
            _ = try await client.send(.get("/api/tasks") as APIRequest<TaskPage>)
        }
        #expect(await credentials.rejected == ["token-abc"])
    }

    @Test func cancelledRequestThrowsCancellationNotAnError() async {
        let started = LockedLines()
        let server = StubServer { _ in
            started.append("started")
            try await _Concurrency.Task.sleep(for: .seconds(30))
            return StubResponse(status: 200)
        }
        let (client, _) = client(server)
        let task = _Concurrency.Task { try await client.send(.get("/api/tasks") as APIRequest<TaskPage>) }
        while started.all.isEmpty { await _Concurrency.Task.yield() }
        task.cancel()
        await #expect(throws: CancellationError.self) { _ = try await task.value }
    }

    @Test func decodingFailureIsReportedWithoutValues() async {
        let log = LockedLines()
        let server = StubServer { _ in StubResponse(status: 200, json: #"{"tasks":"secret-body-value","page":1}"#) }
        await #expect(throws: AppError.decoding) {
            _ = try await client(server, log: log).0.send(.get("/api/tasks") as APIRequest<TaskPage>)
        }
        #expect(log.all.contains { $0.contains("decoding failed at tasks") })
        #expect(!log.all.joined().contains("secret-body-value"))
    }

    @Test func logsCarryNeitherTheTokenNorBodies() async throws {
        let log = LockedLines()
        let signIn = try ContractExamples.example("auth-sign-in.json")
        let server = StubServer { request in
            request.url?.path() == "/api/auth/sign-in/email"
                ? StubResponse(status: 200, headers: ["set-auth-token": "header-token-xyz"], body: signIn)
                : StubResponse(status: 400, json: #"{"error":"secret-error-text","fields":{"title":["secret-field"]}}"#)
        }
        let (client, _) = client(server, log: log)
        let request = try APIRequest<SignInResponse>.post(
            "/api/auth/sign-in/email",
            body: SignInRequest(email: "sam@example.test", password: "password-value")
        )
        let response = try await client.send(request)
        #expect(response.header("Set-Auth-Token") == "header-token-xyz")
        _ = try? await client.send(
            .get("/api/tasks", query: [URLQueryItem(name: "search", value: "private words")]) as APIRequest<TaskPage>)

        let written = log.all.joined(separator: "\n")
        #expect(log.all.count == 2)
        for secret in [
            "token-abc", "header-token-xyz", "REDACTED-SESSION-TOKEN", "sam@example.test", "password-value",
            "secret-error-text", "secret-field", "private words", "private%20words",
        ] {
            #expect(!written.contains(secret), "\(secret)")
        }
    }
}
