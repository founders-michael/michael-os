import Foundation
import os

public struct StubResponse: Sendable {
    public let status: Int
    public let headers: [String: String]
    public let body: Data

    public init(status: Int, headers: [String: String] = [:], body: Data = Data()) {
        self.status = status
        self.headers = headers
        self.body = body
    }

    public init(status: Int, headers: [String: String] = [:], json: String) {
        self.init(status: status, headers: headers, body: Data(json.utf8))
    }
}

/// Answers URLSession requests in tests. Each stub gets its own host, so tests running in parallel never
/// see each other's handlers.
public final class StubServer: Sendable {
    public typealias Handler = @Sendable (URLRequest) async throws -> StubResponse

    public let baseURL: URL
    private let received = OSAllocatedUnfairLock<[URLRequest]>(initialState: [])

    public init(_ handler: @escaping Handler) {
        let host = "stub-\(UUID().uuidString.lowercased()).test"
        guard let url = URL(string: "http://\(host)") else { preconditionFailure("Invalid stub host \(host)") }
        baseURL = url
        let received = self.received
        StubURLProtocol.handlers.withLock {
            $0[host] = { request in
                received.withLock { $0.append(request) }
                return try await handler(request)
            }
        }
    }

    public var requests: [URLRequest] { received.withLock { $0 } }

    public func configuration(_ base: URLSessionConfiguration) -> URLSessionConfiguration {
        base.protocolClasses = [StubURLProtocol.self]
        return base
    }
}

final class StubURLProtocol: URLProtocol, @unchecked Sendable {
    static let handlers = OSAllocatedUnfairLock<[String: StubServer.Handler]>(initialState: [:])
    private let loading = OSAllocatedUnfairLock<_Concurrency.Task<Void, Never>?>(initialState: nil)

    override static func canInit(with request: URLRequest) -> Bool { true }

    override static func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let request = self.request
        let handler = request.url?.host.flatMap { host in Self.handlers.withLock { $0[host] } }
        let task = _Concurrency.Task {
            do {
                guard let handler, let url = request.url else { throw URLError(.cannotFindHost) }
                let stub = try await handler(request)
                guard let response = HTTPURLResponse(url: url, statusCode: stub.status, httpVersion: "HTTP/1.1", headerFields: stub.headers)
                else { throw URLError(.badServerResponse) }
                client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
                client?.urlProtocol(self, didLoad: stub.body)
                client?.urlProtocolDidFinishLoading(self)
            } catch {
                client?.urlProtocol(self, didFailWithError: error)
            }
        }
        loading.withLock { $0 = task }
    }

    override func stopLoading() {
        loading.withLock { $0?.cancel() }
    }
}
