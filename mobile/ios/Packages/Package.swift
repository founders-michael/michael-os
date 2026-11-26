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
    products: ["Models", "Networking", "Auth", "Repositories", "DesignSystem"].map { .library(name: $0, targets: [$0]) }
        + features.map { .library(name: $0, targets: [$0]) },
    targets: [
        .target(name: "Models", path: "Models/Sources", swiftSettings: strict),
        .target(name: "Networking", dependencies: ["Models"], path: "Networking/Sources", swiftSettings: strict),
        .target(name: "Auth", dependencies: ["Networking", "Models"], path: "Auth/Sources", swiftSettings: strict),
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
        .target(
            name: "TestSupport",
            dependencies: ["Repositories", "Auth", "Models"],
            path: "TestSupport/Sources",
            swiftSettings: strict
        ),
        .testTarget(name: "ModelsTests", dependencies: ["Models", "TestSupport"], path: "Models/Tests", swiftSettings: strict),
        .testTarget(
            name: "NetworkingTests",
            dependencies: ["Networking", "Models", "TestSupport"],
            path: "Networking/Tests",
            swiftSettings: strict
        ),
        .testTarget(
            name: "AuthTests",
            dependencies: ["Auth", "Networking", "Models", "TestSupport"],
            path: "Auth/Tests",
            swiftSettings: strict
        ),
        .testTarget(
            name: "AuthFeatureTests",
            dependencies: ["AuthFeature", "Models", "TestSupport"],
            path: "Features/AuthFeature/Tests",
            swiftSettings: mainActorByDefault
        ),
        .testTarget(
            name: "OnboardingFeatureTests",
            dependencies: ["OnboardingFeature", "Models", "TestSupport"],
            path: "Features/OnboardingFeature/Tests",
            swiftSettings: mainActorByDefault
        ),
        .testTarget(
            name: "AssistantFeatureTests",
            dependencies: ["AssistantFeature", "Models", "Networking", "TestSupport"],
            path: "Features/AssistantFeature/Tests",
            swiftSettings: mainActorByDefault
        ),
        .testTarget(
            name: "HabitsFeatureTests",
            dependencies: ["HabitsFeature", "Models", "TestSupport"],
            path: "Features/HabitsFeature/Tests",
            swiftSettings: mainActorByDefault
        ),
        .testTarget(
            name: "TasksFeatureTests",
            dependencies: ["TasksFeature", "Models", "TestSupport"],
            path: "Features/TasksFeature/Tests",
            swiftSettings: mainActorByDefault
        ),
        .testTarget(
            name: "MyDayFeatureTests",
            dependencies: ["MyDayFeature", "Models", "TestSupport"],
            path: "Features/MyDayFeature/Tests",
            swiftSettings: mainActorByDefault
        ),
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
