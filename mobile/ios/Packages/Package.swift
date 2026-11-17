// swift-tools-version: 6.2

import PackageDescription

let strict: [SwiftSetting] = [
    .treatAllWarnings(as: .error),
    .enableUpcomingFeature("NonisolatedNonsendingByDefault"),
    .enableUpcomingFeature("InferIsolatedConformances"),
]

let mainActorByDefault: [SwiftSetting] = strict + [.defaultIsolation(MainActor.self)]

let features = [
    "AuthFeature", "OnboardingFeature", "MyDayFeature", "AssistantFeature", "TasksFeature",
    "HabitsFeature", "CalendarFeature", "GoalsFeature", "ReviewFeature", "SettingsFeature",
]

let package = Package(
    name: "MichaelOSPackages",
    defaultLocalization: "en",
    platforms: [.iOS(.v17)],
    products: [.library(name: "DesignSystem", targets: ["DesignSystem"])]
        + features.map { .library(name: $0, targets: [$0]) },
    targets: [
        .target(name: "Models", path: "Models/Sources", swiftSettings: strict),
        .target(name: "Networking", dependencies: ["Models"], path: "Networking/Sources", swiftSettings: strict),
        .target(name: "Auth", path: "Auth/Sources", swiftSettings: strict),
        .target(
            name: "Repositories",
            dependencies: ["Networking", "Auth", "Models"],
            path: "Repositories/Sources",
            swiftSettings: strict
        ),
        .target(
            name: "DesignSystem",
            path: "DesignSystem/Sources",
            resources: [.process("Resources")],
            swiftSettings: mainActorByDefault
        ),
        .target(name: "TestSupport", dependencies: ["Repositories", "Models"], path: "TestSupport/Sources", swiftSettings: strict),
        .testTarget(
            name: "DesignSystemTests",
            dependencies: ["DesignSystem"],
            path: "DesignSystem/Tests",
            swiftSettings: mainActorByDefault
        ),
    ]
        + features.map {
            .target(
                name: $0,
                dependencies: ["Repositories", "Models", "DesignSystem"],
                path: "Features/\($0)/Sources",
                resources: [.process("Resources")],
                swiftSettings: mainActorByDefault
            )
        }
)
