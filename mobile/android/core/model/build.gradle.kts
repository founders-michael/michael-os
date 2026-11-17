plugins {
    alias(libs.plugins.michael.jvm.library)
    alias(libs.plugins.kotlin.serialization)
}

dependencies {
    api(libs.kotlinx.serialization.json)
    testImplementation(libs.junit)
}

tasks.withType<Test>().configureEach {
    val contract = rootProject.layout.projectDirectory.dir("../contract")
    inputs.dir(contract)
    systemProperty("contract.path", contract.asFile.absolutePath)
}
