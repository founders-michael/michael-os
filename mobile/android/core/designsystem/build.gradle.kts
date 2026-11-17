plugins {
    alias(libs.plugins.michael.android.library)
    alias(libs.plugins.michael.android.compose)
}

dependencies {
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.serialization.json)
}

tasks.withType<Test>().configureEach {
    val tokens = rootProject.layout.projectDirectory.file("../design/tokens.json")
    inputs.file(tokens)
    systemProperty("tokens.path", tokens.asFile.absolutePath)
}
