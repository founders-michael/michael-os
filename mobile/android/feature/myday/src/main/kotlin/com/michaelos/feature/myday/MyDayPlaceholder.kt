package com.michaelos.feature.myday

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.PreviewLightDark
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelPage
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme

/** Stands in for My Day until Phase 4. Sign out lives here for now so the auth flow can be walked end to end. */
@Composable
fun MyDayPlaceholder(onSignOut: () -> Unit) {
    MichaelPage(
        footer = {
            MichaelButton(stringResource(R.string.myday_sign_out), onSignOut, Modifier.fillMaxWidth(), MichaelButtonStyle.Secondary)
        },
    ) {
        MichaelText(
            stringResource(R.string.myday_placeholder),
            MichaelTextStyle.Title,
            MichaelTheme.colors.text,
            Modifier.fillMaxWidth().padding(top = MichaelSpace.xxl),
            textAlign = TextAlign.Center,
        )
    }
}

@PreviewLightDark
@Composable
private fun MyDayPlaceholderPreview() {
    MichaelTheme { MyDayPlaceholder {} }
}
