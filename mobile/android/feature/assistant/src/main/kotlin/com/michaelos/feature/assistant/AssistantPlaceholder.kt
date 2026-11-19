package com.michaelos.feature.assistant

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.PreviewLightDark
import com.michaelos.core.designsystem.component.MichaelBackground
import com.michaelos.core.designsystem.component.MichaelOrb
import com.michaelos.core.designsystem.component.MichaelOrbSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme

/** Stands in for the chat until Phase 5. A question handed over from My Day is shown, not sent. */
@Composable
fun AssistantPlaceholder(
    prompt: String?,
    modifier: Modifier = Modifier,
) {
    val colors = MichaelTheme.colors
    MichaelBackground(modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.fillMaxSize().padding(horizontal = MichaelSpace.xl),
            verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg, Alignment.CenterVertically),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            MichaelOrb(MichaelOrbSize.Large)
            MichaelText(stringResource(R.string.assistant_placeholder), MichaelTextStyle.Title, colors.text)
            if (prompt != null) {
                Column(
                    modifier = Modifier.semantics(mergeDescendants = true) {},
                    verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    MichaelText(stringResource(R.string.assistant_prompt_title), MichaelTextStyle.Eyebrow, colors.faint)
                    MichaelText(prompt, MichaelTextStyle.Body, colors.muted, textAlign = TextAlign.Center)
                }
            }
        }
    }
}

@PreviewLightDark
@Composable
private fun AssistantPlaceholderPreview() {
    MichaelTheme { AssistantPlaceholder("Help me decide what to do with my 2 overdue tasks.") }
}
