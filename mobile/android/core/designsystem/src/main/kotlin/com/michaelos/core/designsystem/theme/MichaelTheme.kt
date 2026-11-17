package com.michaelos.core.designsystem.theme

import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext

private val LocalMichaelColors = staticCompositionLocalOf { MichaelColors.of(dark = true) }
private val LocalIsDark = staticCompositionLocalOf { true }
private val LocalReduceMotion = staticCompositionLocalOf { false }

object MichaelTheme {
    val colors: MichaelColors
        @Composable @ReadOnlyComposable
        get() = LocalMichaelColors.current

    internal val isDark: Boolean
        @Composable @ReadOnlyComposable
        get() = LocalIsDark.current

    val reduceMotion: Boolean
        @Composable @ReadOnlyComposable
        get() = LocalReduceMotion.current
}

@Composable
fun MichaelTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = remember(darkTheme) { MichaelColors.of(darkTheme) }
    val material =
        if (darkTheme) {
            darkColorScheme(
                primary = colors.fill,
                onPrimary = colors.onfill,
                background = colors.bg,
                onBackground = colors.text,
                surface = colors.solid,
                onSurface = colors.text,
                onSurfaceVariant = colors.muted,
                outline = colors.border2,
                error = colors.danger,
            )
        } else {
            lightColorScheme(
                primary = colors.fill,
                onPrimary = colors.onfill,
                background = colors.bg,
                onBackground = colors.text,
                surface = colors.solid,
                onSurface = colors.text,
                onSurfaceVariant = colors.muted,
                outline = colors.border2,
                error = colors.danger,
            )
        }
    CompositionLocalProvider(
        LocalMichaelColors provides colors,
        LocalIsDark provides darkTheme,
        LocalReduceMotion provides rememberRemoveAnimations(),
    ) {
        MaterialTheme(colorScheme = material, content = content)
    }
}

// Android's "Remove animations" sets the animator duration scale to 0. Compose snaps finite animations
// at that scale on its own; the looping ones read this flag so they settle on a designed still frame.
@Composable
private fun rememberRemoveAnimations(): Boolean {
    val resolver = LocalContext.current.contentResolver
    val read = { Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
    var removed by remember { mutableStateOf(read()) }
    DisposableEffect(resolver) {
        val observer =
            object : ContentObserver(Handler(Looper.getMainLooper())) {
                override fun onChange(selfChange: Boolean) {
                    removed = read()
                }
            }
        resolver.registerContentObserver(Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE), false, observer)
        onDispose { resolver.unregisterContentObserver(observer) }
    }
    return removed
}
