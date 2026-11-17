pluginManagement {
    includeBuild("build-logic")
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "MichaelOS"

include(":app")
include(":core:model", ":core:network", ":core:auth", ":core:data", ":core:designsystem", ":core:ui", ":core:testing")
include(
    ":feature:auth",
    ":feature:onboarding",
    ":feature:myday",
    ":feature:assistant",
    ":feature:tasks",
    ":feature:habits",
    ":feature:calendar",
    ":feature:goals",
    ":feature:review",
    ":feature:settings",
)
