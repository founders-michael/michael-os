plugins {
    alias(libs.plugins.michael.android.library)
    alias(libs.plugins.michael.android.hilt)
}

dependencies {
    implementation(project(":core:network"))
    implementation(project(":core:auth"))
    api(project(":core:model"))
    implementation(libs.androidx.datastore.preferences)
}
