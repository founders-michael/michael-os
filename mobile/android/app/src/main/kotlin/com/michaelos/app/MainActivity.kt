package com.michaelos.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.michaelos.core.data.Appearance
import com.michaelos.core.data.AppearanceStore
import com.michaelos.core.designsystem.theme.MichaelTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var appearanceStore: AppearanceStore

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            val appearance by appearanceStore.appearance.collectAsStateWithLifecycle(initialValue = Appearance.System)
            val dark =
                when (appearance) {
                    Appearance.System -> isSystemInDarkTheme()
                    Appearance.Dark -> true
                    Appearance.Light -> false
                }
            MichaelTheme(darkTheme = dark) {
                AppRoot()
            }
        }
    }
}
