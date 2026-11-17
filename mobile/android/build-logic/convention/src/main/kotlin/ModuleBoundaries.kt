import org.gradle.api.GradleException
import org.gradle.api.Project
import org.gradle.api.artifacts.ProjectDependency

// The dependency direction from mobile/docs/architecture-android.md. Declaring a project dependency the
// rule forbids fails configuration, so the forbidden import can never compile.
private val featureMayUse = setOf(":core:data", ":core:model", ":core:designsystem", ":core:ui", ":core:testing")
private val dataMayUse = setOf(":core:network", ":core:auth", ":core:model")

private fun isForbidden(module: String, dependency: String): Boolean =
    when {
        module.startsWith(":feature:") -> dependency !in featureMayUse
        module == ":core:data" -> dependency !in dataMayUse
        module.startsWith(":core:") -> dependency.startsWith(":feature:") || dependency == ":app"
        else -> false
    }

internal fun Project.enforceModuleBoundaries() {
    val module = path
    configurations.configureEach {
        val configuration = name
        dependencies.configureEach {
            if (this is ProjectDependency && path != module && isForbidden(module, path)) {
                throw GradleException(
                    "$module may not depend on $path (in $configuration). See mobile/docs/architecture-android.md.",
                )
            }
        }
    }
}
