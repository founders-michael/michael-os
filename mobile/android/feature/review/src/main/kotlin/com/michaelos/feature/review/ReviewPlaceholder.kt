package com.michaelos.feature.review

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.PreviewLightDark
import com.michaelos.core.designsystem.component.MichaelBackground
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme

@Composable
fun ReviewPlaceholder(modifier: Modifier = Modifier) {
    MichaelBackground(modifier.fillMaxSize()) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            MichaelText(stringResource(R.string.review_placeholder), MichaelTextStyle.Title, MichaelTheme.colors.text)
        }
    }
}

@PreviewLightDark
@Composable
private fun ReviewPlaceholderPreview() {
    MichaelTheme { ReviewPlaceholder() }
}
