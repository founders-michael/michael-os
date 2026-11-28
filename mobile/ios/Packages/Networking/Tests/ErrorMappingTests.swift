import Foundation
import Models
import TestSupport
import Testing

@testable import Networking

struct ErrorMappingTests {
    private struct Table: Decodable {
        let cases: [Row]
    }

    struct Row: Decodable, CustomTestStringConvertible {
        let example: String?
        let body: String?
        let status: Int
        let retryAfter: String?
        let expect: Expected

        var testDescription: String { "\(status) \(example ?? body ?? "")" }
    }

    struct Expected: Decodable, Equatable {
        let `case`: String
        let text: String?
        let code: String?
        let fields: [String]?
        let retryAfterSeconds: Int?
    }

    static let rows = (try? JSONDecoder().decode(Table.self, from: ContractExamples.file("error-mapping.json")))?.cases ?? []

    @Test func anOverlapNamesWhatItOverlaps() throws {
        let body = try ContractExamples.example("calendar-event-create-409-overlap.json")
        guard case .conflict(let server) = appError(for: .response(status: 409, body: body, retryAfter: nil)) else {
            Issue.record("An overlap is a conflict")
            return
        }
        #expect(server.conflicts.map(\.title) == ["Call with the designer"])
    }

    @Test func tableLoads() {
        #expect(Self.rows.count >= 19)
    }

    @Test(arguments: rows)
    func response(_ row: Row) throws {
        let body = try row.example.map(ContractExamples.example) ?? Data((row.body ?? "").utf8)
        let error = appError(for: .response(status: row.status, body: body, retryAfter: row.retryAfter))
        #expect(Self.summary(of: error, like: row.expect) == row.expect)
    }

    @Test(arguments: [
        (URLError.Code.timedOut, AppError.timeout),
        (.notConnectedToInternet, .offline),
        (.networkConnectionLost, .offline),
        (.cannotFindHost, .offline),
        (.cannotConnectToHost, .offline),
        (.dnsLookupFailed, .offline),
        (.dataNotAllowed, .offline),
        (.secureConnectionFailed, .offline),
    ])
    func transport(code: URLError.Code, expected: AppError) {
        #expect(appError(for: .transport(URLError(code))) == expected)
    }

    private static func summary(of error: AppError, like expected: Expected) -> Expected {
        let name: String
        var message = ServerMessage()
        var fields: [String]?
        var retryAfter: Int?
        switch error {
        case .offline: name = "offline"
        case .timeout: name = "timeout"
        case .decoding: name = "decoding"
        case .unauthorized(let server): (name, message) = ("unauthorized", server)
        case .forbidden(let server): (name, message) = ("forbidden", server)
        case .notFound(let server): (name, message) = ("notFound", server)
        case .conflict(let server): (name, message) = ("conflict", server)
        case .server(let server): (name, message) = ("server", server)
        case .validation(let server, let map):
            (name, message, fields) = ("validation", server, map.keys.sorted())
        case .rateLimited(let server, let duration):
            (name, message) = ("rateLimited", server)
            retryAfter = duration.map { Int($0.components.seconds) }
        }
        return Expected(
            case: name,
            text: message.text,
            code: message.code,
            fields: expected.fields == nil ? nil : fields,
            retryAfterSeconds: retryAfter
        )
    }
}
