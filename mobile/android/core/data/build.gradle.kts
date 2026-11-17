plugins {
    alias(libs.plugins.michael.android.library)
}

dependencies {
    implementation(project(":core:network"))
    implementation(project(":core:auth"))
    implementation(project(":core:model"))
}
