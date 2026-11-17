package com.michaelos.core.designsystem.component

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.michaelos.core.designsystem.theme.MichaelSpace

/**
 * A full screen of content with its actions at the bottom. When everything fits, the actions sit at the foot of
 * the screen; at large font scales the whole page scrolls and the actions follow the content.
 */
@Composable
fun MichaelPage(
    modifier: Modifier = Modifier,
    footer: @Composable ColumnScope.() -> Unit,
    content: @Composable ColumnScope.() -> Unit,
) {
    MichaelBackground(modifier = modifier.fillMaxSize()) {
        BoxWithConstraints(modifier = Modifier.windowInsetsPadding(WindowInsets.safeDrawing).imePadding()) {
            val viewport = maxHeight
            Column(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .verticalScroll(rememberScrollState())
                        .heightIn(min = viewport)
                        .padding(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.lg),
                verticalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xl), content = content)
                Column(
                    modifier = Modifier.padding(top = MichaelSpace.xl),
                    verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
                    content = footer,
                )
            }
        }
    }
}
