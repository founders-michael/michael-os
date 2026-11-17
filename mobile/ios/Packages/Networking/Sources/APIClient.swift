import Foundation
import Models
import os

/// The app's one HTTP client. It stores no cookies and adds no `Origin`, `Referer` or `Sec-Fetch-*` header:
/// the server treats any of those as a browser request and refuses it without a trusted origin.
public final class APIClient: Sendable {
    private let baseURL: URL
    private let session: URLSession
    private let credentials: any SessionCredentials
    private let retryDelay: Duration
    private let log: @Sendable (String) -> Void

    public init(
        baseURL: URL,
        credentials: any SessionCredentials,
        configuration: URLSessionConfiguration = APIClient.configuration(),
        retryDelay: Duration = .milliseconds(500),
        log: @escaping @Sendable (String) -> Void = APIClient.systemLog
    ) {
        self.baseURL = baseURL
        self.credentials = credentials
        self.session = URLSession(configuration: configuration)
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
        var retries = 0
        while true {
            do {
                return try await attempt(request)
            } catch let error as AppError where request.method == .get && retries < 2 && error.isRetryable {
                retries += 1
                try await _Concurrency.Task.sleep(for: retryDelay * (1 << (retries - 1)))
            }
        }
    }

    private func attempt<Response>(_ request: APIRequest<Response>) async throws -> APIResponse<Response> {
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
        do {
            let value = try JSONDecoder.api().decode(Response.self, from: data)
            let headers = http.allHeaderFields.reduce(into: [String: String]()) { result, field in
                if let name = field.key as? String, let value = field.value as? String { result[name] = value }
            }
            return APIResponse(value: value, headers: headers)
        } catch let error as DecodingError {
            log("\(request.method.rawValue) \(request.path) decoding failed at \(error.codingPathDescription)")
            throw AppError.decoding
        }
    }

    private func makeURLRequest<Response>(_ request: APIRequest<Response>, token: String?) -> URLRequest {
        var url = baseURL.appending(path: request.path)
        if !request.query.isEmpty { url.append(queryItems: request.query) }
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = request.method.rawValue
        urlRequest.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body = request.body {
            urlRequest.httpBody = body
            urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
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
