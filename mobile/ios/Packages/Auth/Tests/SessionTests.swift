import Foundation
import Models
import Networking
import TestSupport
import Testing

@testable import Auth

@MainActor
struct SessionTests {
    private func client(_ server: StubServer, session: Session) -> APIClient {
        APIClient(
            baseURL: server.baseURL,
            credentials: session,
            configuration: server.configuration(APIClient.configuration()),
            retryDelay: .zero,
            log: { _ in }
        )
    }

    @Test func startsFromTheStoredToken() {
        #expect(Session(store: FakeTokenStore(token: "stored")).state == .signedIn)
        #expect(Session(store: FakeTokenStore()).state == .signedOut)
    }

    @Test func beginSavesAndEndDeletes() throws {
        let store = FakeTokenStore()
        let session = Session(store: store)
        session.begin("fresh")
        #expect(session.state == .signedIn)
        #expect(try store.read() == "fresh")
        session.end()
        #expect(session.state == .signedOut)
        #expect(try store.read() == nil)
        #expect(session.currentToken() == nil)
    }

    @Test func threeConcurrentUnauthorizedResponsesSignOutOnce() async throws {
        let store = FakeTokenStore(token: "expired")
        let session = Session(store: store)
        let body = try ContractExamples.example("tasks-list-401.json")
        let server = StubServer { _ in StubResponse(status: 401, body: body) }
        let client = client(server, session: session)

        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<3 {
                group.addTask { _ = try? await client.send(.get("/api/tasks") as APIRequest<TaskPage>) }
            }
        }

        #expect(server.requests.count == 3)
        #expect(session.state == .signedOut)
        #expect(store.deletes == 1)
    }

    @Test func lateUnauthorizedForAReplacedTokenIsIgnored() {
        let store = FakeTokenStore(token: "old")
        let session = Session(store: store)
        session.begin("new")
        session.reject("old")
        #expect(session.state == .signedIn)
        #expect(session.currentToken() == "new")
        #expect(store.deletes == 0)
    }

    @Test func signInKeepsTheHeaderToken() async throws {
        let body = try ContractExamples.example("auth-sign-in.json")
        let server = StubServer { _ in StubResponse(status: 200, headers: ["set-auth-token": "signed.token"], body: body) }
        let store = FakeTokenStore()
        let session = Session(store: store)
        let user = try await Authenticator(client: client(server, session: session), session: session)
            .signIn(email: "sam@example.test", password: "LocalOnly-Sample-2026")
        #expect(user.name == "Sam Rivera")
        #expect(session.state == .signedIn)
        #expect(try store.read() == "signed.token")
        let sent = try #require(server.requests.first)
        #expect(sent.value(forHTTPHeaderField: "Authorization") == nil)
    }

    @Test func signInWithoutTheHeaderIsADecodingFailure() async throws {
        let body = try ContractExamples.example("auth-sign-in.json")
        let server = StubServer { _ in StubResponse(status: 200, body: body) }
        let session = Session(store: FakeTokenStore())
        await #expect(throws: AppError.decoding) {
            _ = try await Authenticator(client: client(server, session: session), session: session)
                .signIn(email: "sam@example.test", password: "LocalOnly-Sample-2026")
        }
        #expect(session.state == .signedOut)
    }

    @Test func wrongPasswordDoesNotTouchTheSession() async throws {
        let body = try ContractExamples.example("auth-sign-in-wrong-password-401.json")
        let server = StubServer { _ in StubResponse(status: 401, body: body) }
        let store = FakeTokenStore()
        let session = Session(store: store)
        await #expect(throws: AppError.unauthorized(ServerMessage(text: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD"))) {
            _ = try await Authenticator(client: client(server, session: session), session: session)
                .signIn(email: "sam@example.test", password: "wrong")
        }
        #expect(store.deletes == 0)
    }

    @Test func signOutEndsTheSessionEvenWhenTheServerFails() async throws {
        let server = StubServer { _ in throw URLError(.notConnectedToInternet) }
        let store = FakeTokenStore(token: "live")
        let session = Session(store: store)
        await Authenticator(client: client(server, session: session), session: session).signOut()
        #expect(session.state == .signedOut)
        #expect(try store.read() == nil)
        #expect(server.requests.first?.value(forHTTPHeaderField: "Authorization") == "Bearer live")
    }
}
