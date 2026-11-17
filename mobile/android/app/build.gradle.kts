plugins {
    alias(libs.plugins.michael.android.application)
    alias(libs.plugins.michael.android.compose)
    alias(libs.plugins.michael.android.hilt)
}

android {
    namespace = "com.michaelos.app"

    defaultConfig {
        applicationId = "com.michaelos.app"
        versionCode = 1
        versionName = "0.1.0"
        // The legal pages are not written yet (mobile/docs/backlog.md); these are the addresses they will have.
        buildConfigField("String", "LEGAL_TERMS_URL", "\"https://michaelos.com/terms\"")
        buildConfigField("String", "LEGAL_PRIVACY_URL", "\"https://michaelos.com/privacy\"")
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            // `adb reverse tcp:3000 tcp:3000` forwards the device's loopback to the dev machine. Android 17 blocks
            // apps from LAN addresses such as the emulator's 10.0.2.2 without the runtime ACCESS_LOCAL_NETWORK
            // permission; loopback is exempt, and the same setup works for a phone on USB.
            buildConfigField("String", "API_BASE_URL", "\"http://127.0.0.1:3000\"")
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
    implementation(project(":core:model"))
    implementation(project(":core:network"))
    implementation(project(":core:auth"))
    implementation(project(":core:data"))
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
    implementation(libs.androidx.hilt.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.navigation3.runtime)
    implementation(libs.androidx.navigation3.ui)
    implementation(libs.androidx.lifecycle.viewmodel.navigation3)
}
