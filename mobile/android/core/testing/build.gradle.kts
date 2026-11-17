plugins {
    alias(libs.plugins.michael.android.library)
}

dependencies {
    api(project(":core:auth"))
    api(project(":core:data"))
    api(project(":core:model"))
    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.coroutines.test)
    implementation(libs.junit)
}
