import Foundation

/// `mobile/contract/`: real server responses in `examples/` and the shared error table. Both apps' tests read
/// the same files.
public enum ContractExamples {
    public static let directory = URL(filePath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appending(path: "contract")

    public static func example(_ name: String) throws -> Data {
        try Data(contentsOf: directory.appending(path: "examples/\(name)"))
    }

    public static func file(_ name: String) throws -> Data {
        try Data(contentsOf: directory.appending(path: name))
    }
}
