plugins {
    alias(libs.plugins.michael.android.application)
    alias(libs.plugins.michael.android.compose)
}

android {
    namespace = "com.michaelos.app"

    defaultConfig {
        applicationId = "com.michaelos.app"
        versionCode = 1
        versionName = "0.1.0"
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            // The emulator reaches the dev machine's localhost through 10.0.2.2.
            buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:3000\"")
        }
        release {
            // Hosting is undecided (mobile/docs/backlog.md). The reserved .invalid name fails loudly until it is set.
            buildConfigField("String", "API_BASE_URL", "\"https://api.invalid\"")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }
}

dependencies {
    implementation(project(":core:designsystem"))
    implementation(project(":feature:auth"))
    implementation(project(":feature:onboarding"))
    implementation(project(":feature:myday"))
    implementation(project(":feature:assistant"))
    implementation(project(":feature:tasks"))
    implementation(project(":feature:habits"))
    implementation(project(":feature:calendar"))
    implementation(project(":feature:goals"))
    implementation(project(":feature:review"))
    implementation(project(":feature:settings"))
    implementation(libs.androidx.activity.compose)
}
