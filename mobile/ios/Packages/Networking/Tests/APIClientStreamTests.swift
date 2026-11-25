import Foundation
import Models
import TestSupport
import Testing

@testable import Networking

struct APIClientStreamTests {
    private actor Credentials: SessionCredentials {
        private(set) var rejected: [String] = []

        func currentToken() -> String? { "token-abc" }

        func reject(_ token: String) { rejected.append(token) }
    }

    private struct Body: Encodable {
        let message: String
    }

    private func client(_ server: StubServer, credentials: Credentials = Credentials()) -> APIClient {
        APIClient(
            baseURL: server.baseURL,
            credentials: credentials,
            configuration: server.configuration(APIClient.configuration()),
            retryDelay: .zero,
            log: { _ in }
        )
    }

    @Test func eventsArriveInOrderAndTheRequestIsATurn() async throws {
        let stream = try ContractExamples.example("ai-chat-stream-draft.sse")
        let server = StubServer { _ in StubResponse(status: 200, headers: ["Content-Type": "text/event-stream"], body: stream) }
        var events: [ChatEvent] = []
        try await client(server).stream("/api/ai/chat", body: Body(message: "Add a task")) { events.append($0) }
        #expect(events.count == 5)
        #expect(events.first == .accepted)
        guard case .message(let reply) = events.last else {
            Issue.record("The stream should end with the reply")
            return
        }
        #expect(reply.drafts.first?.kind == .task)
        let request = try #require(server.requests.first)
        #expect(request.httpMethod == "POST")
        #expect(request.value(forHTTPHeaderField: "Accept") == "text/event-stream")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer token-abc")
        #expect(request.value(forHTTPHeaderField: "Origin") == nil)
        #expect(request.sentBody == Data(#"{"message":"Add a task"}"#.utf8))
    }

    @Test func aRefusalBeforeTheStreamIsAnAppErrorWithItsCode() async throws {
        let body = try ContractExamples.example("ai-chat-403-setup.json")
        let server = StubServer { _ in StubResponse(status: 403, body: body) }
        await #expect(
            throws: AppError.forbidden(
                ServerMessage(
                    text: "Complete LifestyleOS setup before asking Michael about your personal information.",
                    code: "LIFESTYLE_SETUP_REQUIRED"
                ))
        ) {
            try await client(server).stream("/api/ai/chat", body: Body(message: "Hi")) { _ in }
        }
    }

    @Test func rateLimitCarriesRetryAfter() async {
        let server = StubServer { _ in
            StubResponse(status: 429, headers: ["Retry-After": "12"], json: #"{"error":"Too many.","code":"RATE_LIMITED"}"#)
        }
        await #expect(throws: AppError.rateLimited(ServerMessage(text: "Too many.", code: "RATE_LIMITED"), retryAfter: .seconds(12))) {
            try await client(server).stream("/api/ai/chat", body: Body(message: "Hi")) { _ in }
        }
    }

    @Test func unauthorizedRejectsTheToken() async {
        let credentials = Credentials()
        let server = StubServer { _ in StubResponse(status: 401, json: #"{"error":"Sign in.","code":"UNAUTHENTICATED"}"#) }
        await #expect(throws: AppError.self) {
            try await client(server, credentials: credentials).stream("/api/ai/chat", body: Body(message: "Hi")) { _ in }
        }
        #expect(await credentials.rejected == ["token-abc"])
    }

    @Test func aStreamThatClosesWithoutAReplyJustEnds() async throws {
        let server = StubServer { _ in StubResponse(status: 200, body: Data("data: {\"type\":\"accepted\"}\n\n".utf8)) }
        var events: [ChatEvent] = []
        try await client(server).stream("/api/ai/chat", body: Body(message: "Hi")) { events.append($0) }
        #expect(events == [.accepted])
    }
}
