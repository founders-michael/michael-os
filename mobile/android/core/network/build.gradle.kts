plugins {
    alias(libs.plugins.michael.android.library)
    alias(libs.plugins.michael.android.hilt)
    alias(libs.plugins.kotlin.serialization)
}

dependencies {
    api(project(":core:model"))
    api(libs.okhttp)
    implementation(libs.kotlinx.coroutines.core)
    testImplementation(project(":core:testing"))
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
}

tasks.withType<Test>().configureEach {
    val contract = rootProject.layout.projectDirectory.dir("../contract")
    inputs.dir(contract)
    systemProperty("contract.path", contract.asFile.absolutePath)
}
