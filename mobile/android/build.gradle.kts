plugins {
    base
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.hilt) apply false
    alias(libs.plugins.ksp) apply false
}

val kotlinSources =
    fileTree(rootDir) {
        include("**/src/*/kotlin/**/*.kt")
        exclude("**/build/**")
    }

// detekt and ktlint run as their command-line tools over every module at once. Both Gradle plugins
// predate AGP 9's built-in Kotlin and Gradle 9's API, so they would miss sources or log deprecations.
val detekt = configurations.create("detekt")

val ktlint = configurations.create("ktlint")

detekt.resolutionStrategy.eachDependency {
    if (requested.group == "org.jetbrains.kotlin") {
        useVersion(libs.versions.detektKotlin.get())
    }
}

dependencies {
    detekt(libs.detekt.cli)
    ktlint(libs.ktlint.cli) {
        attributes {
            attribute(Bundling.BUNDLING_ATTRIBUTE, objects.named(Bundling.EXTERNAL))
        }
    }
}

val ktlintPatterns = listOf("**/src/**/*.kt", "**/*.gradle.kts", "!**/build/**")

val ktlintCheck =
    tasks.register<JavaExec>("ktlintCheck") {
        group = LifecycleBasePlugin.VERIFICATION_GROUP
        description = "Checks Kotlin style with ktlint."
        classpath = ktlint
        mainClass.set("com.pinterest.ktlint.Main")
        args = listOf("--relative") + ktlintPatterns
        inputs.files(kotlinSources)
        inputs.file(".editorconfig")
    }

tasks.register<JavaExec>("ktlintFormat") {
    group = "formatting"
    description = "Fixes Kotlin style with ktlint."
    classpath = ktlint
    mainClass.set("com.pinterest.ktlint.Main")
    args = listOf("--format", "--relative") + ktlintPatterns
    jvmArgs("--add-opens=java.base/java.lang=ALL-UNNAMED")
}

val detektCheck =
    tasks.register<JavaExec>("detekt") {
        group = LifecycleBasePlugin.VERIFICATION_GROUP
        description = "Runs detekt over every module."
        classpath = detekt
        mainClass.set("io.gitlab.arturbosch.detekt.cli.Main")
        args =
            listOf(
                "--input",
                rootDir.absolutePath,
                "--includes",
                "**/src/*/kotlin/**/*.kt",
                "--excludes",
                "**/build/**",
                "--config",
                file("config/detekt/detekt.yml").absolutePath,
                "--build-upon-default-config",
            )
        inputs.files(kotlinSources)
        inputs.file("config/detekt/detekt.yml")
    }

tasks.named("check") {
    dependsOn(detektCheck, ktlintCheck)
}

// Feature and app code use design tokens only (engineering-standards.md section 7): no colour, dp or sp
// literals. A 1.dp hairline is allowed; borders are 1 everywhere in the mocks and it is not a spacing value.
val tokensOnly =
    tasks.register("checkTokensOnly") {
        group = LifecycleBasePlugin.VERIFICATION_GROUP
        description = "Fails on colour, dp or sp literals outside the design system."
        val sources =
            fileTree(rootDir) {
                include("feature/*/src/**/*.kt", "app/src/**/*.kt")
                exclude("**/build/**")
            }
        inputs.files(sources)
        val root = rootDir
        doLast {
            val literal = Regex("""Color\(\s*0x|Color\(\s*red\s*=|\b(?!1\.dp\b)\d+(\.\d+)?\.(dp|sp)\b""")
            val hits =
                sources.files.flatMap { file ->
                    file.readLines().mapIndexedNotNull { index, line ->
                        if (literal.containsMatchIn(line)) "${file.relativeTo(root)}:${index + 1}: ${line.trim()}" else null
                    }
                }
            if (hits.isNotEmpty()) {
                throw GradleException("Use MichaelTheme tokens instead of literals:\n" + hits.joinToString("\n"))
            }
        }
    }

tasks.named("check") {
    dependsOn(tokensOnly)
}
