import Foundation

public struct APIRequest<Response: Decodable & Sendable>: Sendable {
    public enum Method: String, Sendable {
        case get = "GET"
        case post = "POST"
        case patch = "PATCH"
        case put = "PUT"
        case delete = "DELETE"
    }

    let method: Method
    let path: String
    let query: [URLQueryItem]
    let body: Data?

    public static func get(_ path: String, query: [URLQueryItem] = []) -> Self {
        Self(method: .get, path: path, query: query, body: nil)
    }

    public static func post(_ path: String, body: some Encodable) throws -> Self {
        Self(method: .post, path: path, query: [], body: try JSONEncoder.api().encode(body))
    }

    public static func patch(_ path: String, body: some Encodable) throws -> Self {
        Self(method: .patch, path: path, query: [], body: try JSONEncoder.api().encode(body))
    }

    public static func put(_ path: String, body: some Encodable) throws -> Self {
        Self(method: .put, path: path, query: [], body: try JSONEncoder.api().encode(body))
    }

    public static func delete(_ path: String) -> Self {
        Self(method: .delete, path: path, query: [], body: nil)
    }
}

public struct APIResponse<Value: Sendable>: Sendable {
    public let value: Value
    let headers: [String: String]

    /// Header names are matched without regard to case, as HTTP requires.
    public func header(_ name: String) -> String? {
        headers.first { $0.key.caseInsensitiveCompare(name) == .orderedSame }?.value
    }
}

/// Request bodies that are an empty JSON object, which some Better Auth routes expect.
public struct EmptyBody: Encodable, Sendable {
    public init() {}
}

/// The response of a request answered with 204 and no body.
public struct NoContent: Decodable, Sendable {}

/// Where the client gets the bearer token and where it reports that the server refused one.
public protocol SessionCredentials: Sendable {
    func currentToken() async -> String?
    /// The server answered 401 to a request sent with `token`.
    func reject(_ token: String) async
}

/// The response type of a request whose body is read some other way, such as an event stream.
struct EmptyResponse: Decodable, Sendable {}
