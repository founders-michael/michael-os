package com.michaelos.feature.myday

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import com.michaelos.core.designsystem.component.SkeletonBlock
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace

/** The day's layout with blocks where the text will be, so the content replaces it without a jump. */
@Composable
internal fun MyDaySkeleton() {
    val loading = stringResource(R.string.myday_loading)
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .padding(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.lg)
                .clearAndSetSemantics { contentDescription = loading },
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            SkeletonBlock(MichaelSpace.md, Modifier.fillMaxWidth(EYEBROW))
            SkeletonBlock(MichaelSpace.xxl, Modifier.fillMaxWidth(TITLE))
            SkeletonBlock(MichaelSpace.lg, Modifier.fillMaxWidth(BRIEFING))
        }
        SkeletonBlock(MichaelSize.button * 2, Modifier.fillMaxWidth(), cornerRadius = MichaelRadius.card)
        SkeletonBlock(MichaelSize.button * PROGRESS_ROWS, Modifier.fillMaxWidth(), cornerRadius = MichaelRadius.card)
        SkeletonBlock(MichaelSpace.lg, Modifier.fillMaxWidth(HEADING))
        rowWidths.forEach { SkeletonRow(it) }
        SkeletonBlock(MichaelSpace.lg, Modifier.fillMaxWidth(HEADING))
        SkeletonRow(HABIT)
    }
}

@Composable
private fun SkeletonRow(titleWidth: Float) {
    Row(
        modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = MichaelSize.checkTouch),
        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SkeletonBlock(MichaelSize.check, width = MichaelSize.check, cornerRadius = MichaelRadius.pill)
        SkeletonBlock(MichaelSpace.lg, Modifier.fillMaxWidth(titleWidth))
    }
}

// Fractions of the width, so the blocks read as lines of different lengths.
private const val EYEBROW = 0.4f
private const val TITLE = 0.8f
private const val BRIEFING = 0.9f
private const val HEADING = 0.3f
private const val HABIT = 0.5f
private const val PROGRESS_ROWS = 1.5f
private val rowWidths = listOf(0.7f, 0.55f, 0.62f)
