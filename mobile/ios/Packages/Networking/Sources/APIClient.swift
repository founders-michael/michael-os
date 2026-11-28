import Foundation
import Models
import os

/// The app's one HTTP client. It stores no cookies and adds no `Origin`, `Referer` or `Sec-Fetch-*` header:
/// the server treats any of those as a browser request and refuses it without a trusted origin.
public final class APIClient: Sendable {
    private let baseURL: URL
    private let session: URLSession
    private let streamSession: URLSession
    private let credentials: any SessionCredentials
    private let retryDelay: Duration
    private let log: @Sendable (String) -> Void

    public init(
        baseURL: URL,
        credentials: any SessionCredentials,
        configuration: URLSessionConfiguration = APIClient.configuration(),
        retryDelay: Duration = .milliseconds(500),
        streamSilence: TimeInterval = 90,
        log: @escaping @Sendable (String) -> Void = APIClient.systemLog
    ) {
        self.baseURL = baseURL
        self.credentials = credentials
        self.session = URLSession(configuration: configuration)
        // The request timeout is the longest gap between bytes, which is what "90 s of silence" means; the turn as
        // a whole may run for several model calls.
        let streaming = (configuration.copy() as? URLSessionConfiguration) ?? configuration
        streaming.timeoutIntervalForRequest = streamSilence
        streaming.timeoutIntervalForResource = 600
        self.streamSession = URLSession(configuration: streaming)
        self.retryDelay = retryDelay
        self.log = log
    }

    public static func configuration() -> URLSessionConfiguration {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 30
        return configuration
    }

    public static let systemLog: @Sendable (String) -> Void = { line in
        Logger(subsystem: "com.michaelos.app", category: "api").debug("\(line, privacy: .public)")
    }

    /// Throws `AppError`, or `CancellationError` when the calling task is cancelled. Reads are retried at most
    /// twice, with backoff, when the failure is `offline`, `timeout` or `server`; writes never are.
    public func send<Response>(_ request: APIRequest<Response>) async throws -> APIResponse<Response> {
        try await retrying(request) { try await self.attempt(request) }
    }

    /// A GET whose body is read as it came, such as an image. Throws and retries as `send` does.
    public func data(_ path: String) async throws -> Data {
        let request = APIRequest<NoContent>.get(path)
        return try await retrying(request) { try await self.exchange(request).data }
    }

    private func retrying<Response, Value>(
        _ request: APIRequest<Response>, _ work: () async throws -> Value
    ) async throws -> Value {
        var retries = 0
        while true {
            do {
                return try await work()
            } catch let error as AppError where request.method == .get && retries < 2 && error.isRetryable {
                retries += 1
                try await _Concurrency.Task.sleep(for: retryDelay * (1 << (retries - 1)))
            }
        }
    }

    private func attempt<Response>(_ request: APIRequest<Response>) async throws -> APIResponse<Response> {
        let (data, http) = try await exchange(request)
        do {
            // A 204 has no body; a request that expects none reads it as `NoContent`.
            let body = data.isEmpty && Response.self == NoContent.self ? Data("{}".utf8) : data
            let value = try JSONDecoder.api().decode(Response.self, from: body)
            let headers = http.allHeaderFields.reduce(into: [String: String]()) { result, field in
                if let name = field.key as? String, let value = field.value as? String { result[name] = value }
            }
            return APIResponse(value: value, headers: headers)
        } catch let error as DecodingError {
            log("\(request.method.rawValue) \(request.path) decoding failed at \(error.codingPathDescription)")
            throw AppError.decoding
        }
    }

    /// One round trip; a status outside 2xx throws.
    private func exchange<Response>(_ request: APIRequest<Response>) async throws -> (data: Data, http: HTTPURLResponse) {
        let token = await credentials.currentToken()
        let urlRequest = makeURLRequest(request, token: token)
        let started = ContinuousClock.now
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: urlRequest)
        } catch let error as URLError {
            if error.code == .cancelled || _Concurrency.Task.isCancelled { throw CancellationError() }
            log("\(request.method.rawValue) \(request.path) failed: URLError \(error.code.rawValue)")
            throw appError(for: .transport(error))
        }
        guard let http = response as? HTTPURLResponse else { throw AppError.server(ServerMessage()) }
        let milliseconds = Int((ContinuousClock.now - started) / .milliseconds(1))
        log("\(request.method.rawValue) \(request.path) \(http.statusCode) \(milliseconds)ms")

        guard (200..<300).contains(http.statusCode) else {
            if http.statusCode == 401, let token { await credentials.reject(token) }
            let retryAfter = http.value(forHTTPHeaderField: "Retry-After")
            throw appError(for: .response(status: http.statusCode, body: data, retryAfter: retryAfter))
        }
        return (data, http)
    }

    /// Posts `body` and reads the reply as an event stream, handing each event to `onEvent` in order, and returns
    /// when the server closes the stream. A refusal before the stream opens throws `AppError` as any request does;
    /// so does 90 seconds without a byte, which the server's 15-second pings rule out while it is working. Never
    /// retried: the request starts a turn.
    public func stream(_ path: String, body: some Encodable, onEvent: (ChatEvent) -> Void) async throws {
        let request = try APIRequest<EmptyResponse>.post(path, body: body)
        let token = await credentials.currentToken()
        var urlRequest = makeURLRequest(request, token: token)
        urlRequest.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        let started = ContinuousClock.now
        do {
            let (bytes, response) = try await streamSession.bytes(for: urlRequest)
            guard let http = response as? HTTPURLResponse else { throw AppError.server(ServerMessage()) }
            log("POST \(path) \(http.statusCode) opened \(Int((ContinuousClock.now - started) / .milliseconds(1)))ms")
            guard (200..<300).contains(http.statusCode) else {
                var body = Data()
                for try await byte in bytes where body.count < Self.refusalLimit { body.append(byte) }
                if http.statusCode == 401, let token { await credentials.reject(token) }
                let retryAfter = http.value(forHTTPHeaderField: "Retry-After")
                throw appError(for: .response(status: http.statusCode, body: body, retryAfter: retryAfter))
            }
            var parser = EventStreamParser(log: log)
            var line: [UInt8] = []
            for try await byte in bytes {
                line.append(byte)
                guard byte == UInt8(ascii: "\n") else { continue }
                for event in parser.push(line) { onEvent(event) }
                line.removeAll(keepingCapacity: true)
            }
            log("POST \(path) closed \(Int((ContinuousClock.now - started) / .milliseconds(1)))ms")
        } catch let error as URLError {
            if error.code == .cancelled || _Concurrency.Task.isCancelled { throw CancellationError() }
            log("POST \(path) stream failed: URLError \(error.code.rawValue)")
            throw appError(for: .transport(error))
        }
    }

    private static let refusalLimit = 64 * 1024

    private func makeURLRequest<Response>(_ request: APIRequest<Response>, token: String?) -> URLRequest {
        var url = baseURL.appending(path: request.path)
        if !request.query.isEmpty { url.append(queryItems: request.query) }
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = request.method.rawValue
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body = request.body {
            urlRequest.httpBody = body
            urlRequest.setValue(request.contentType, forHTTPHeaderField: "Content-Type")
        }
        if let token { urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return urlRequest
    }
}

extension AppError {
    fileprivate var isRetryable: Bool {
        switch self {
        case .offline, .timeout, .server: true
        default: false
        }
    }
}

extension DecodingError {
    // Only key names: the error's own description can quote the value, and bodies never reach logs.
    fileprivate var codingPathDescription: String {
        let path: [any CodingKey]
        switch self {
        case .keyNotFound(let key, let context):
            path = context.codingPath + [key]
        case .typeMismatch(_, let context), .valueNotFound(_, let context), .dataCorrupted(let context):
            path = context.codingPath
        @unknown default:
            path = []
        }
        let keys = path.map { $0.intValue.map(String.init) ?? $0.stringValue }
        return keys.isEmpty ? "<root>" : keys.joined(separator: ".")
    }
}
