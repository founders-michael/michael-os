package com.michaelos.app

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.michaelos.core.designsystem.component.MichaelSegmentedControl
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelTheme

private enum class DebugTab { Components, Api }

@Composable
fun AppRoot() {
    // Launch with `--es debugTab api` to open on the API screen.
    val requested = LocalActivity.current?.intent?.getStringExtra("debugTab")
    var tab by rememberSaveable { mutableStateOf(if (requested == "api") DebugTab.Api else DebugTab.Components) }
    Column {
        Box(modifier = Modifier.weight(1f)) {
            when (tab) {
                DebugTab.Components -> ComponentGallery()
                DebugTab.Api -> ApiProbeScreen()
            }
        }
        MichaelTheme {
            MichaelSegmentedControl(
                options = DebugTab.entries,
                selected = tab,
                onSelect = { tab = it },
                title = {
                    when (it) {
                        DebugTab.Components -> stringResource(R.string.debug_tab_components)
                        DebugTab.Api -> stringResource(R.string.debug_tab_api)
                    }
                },
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .windowInsetsPadding(WindowInsets.navigationBars)
                        .padding(MichaelSpace.sm),
            )
        }
    }
}
