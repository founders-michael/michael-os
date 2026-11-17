import os

/// Collects log lines in tests, from any thread.
public final class LockedLines: Sendable {
    private let lines = OSAllocatedUnfairLock<[String]>(initialState: [])

    public init() {}

    public var all: [String] { lines.withLock { $0 } }

    public var append: @Sendable (String) -> Void {
        { [lines] line in lines.withLock { $0.append(line) } }
    }
}
