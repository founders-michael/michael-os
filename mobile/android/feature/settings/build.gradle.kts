plugins {
    alias(libs.plugins.michael.android.feature)
    alias(libs.plugins.michael.android.hilt)
    alias(libs.plugins.kotlin.serialization)
}

dependencies {
    implementation(libs.androidx.navigation3.runtime)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.hilt.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    testImplementation(project(":core:testing"))
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}

tasks.withType<Test>().configureEach {
    val contract = rootProject.layout.projectDirectory.dir("../contract")
    inputs.dir(contract)
    systemProperty("contract.path", contract.asFile.absolutePath)
}
