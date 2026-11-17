plugins {
    alias(libs.plugins.michael.android.library)
    alias(libs.plugins.michael.android.hilt)
}

dependencies {
    api(project(":core:network"))
    implementation(project(":core:model"))
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.kotlinx.coroutines.android)
    testImplementation(project(":core:testing"))
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.turbine)
}

tasks.withType<Test>().configureEach {
    val contract = rootProject.layout.projectDirectory.dir("../contract")
    inputs.dir(contract)
    systemProperty("contract.path", contract.asFile.absolutePath)
}
