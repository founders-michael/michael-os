package com.michaelos.feature.auth

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.PreviewLightDark
import androidx.compose.ui.unit.dp
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelOrb
import com.michaelos.core.designsystem.component.MichaelOrbSize
import com.michaelos.core.designsystem.component.MichaelPage
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme

@Composable
fun WelcomeScreen(
    termsUrl: String,
    privacyUrl: String,
    onSignIn: () -> Unit,
    onRegister: () -> Unit,
) {
    val colors = MichaelTheme.colors
    MichaelPage(
        footer = {
            MichaelButton(stringResource(R.string.welcome_sign_in), onSignIn, Modifier.fillMaxWidth())
            MichaelButton(stringResource(R.string.welcome_register), onRegister, Modifier.fillMaxWidth(), MichaelButtonStyle.Ghost)
            LegalText(stringResource(R.string.welcome_legal, termsUrl, privacyUrl))
        },
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(top = MichaelSpace.xxl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(MichaelSpace.xl),
        ) {
            Box(
                modifier = Modifier.size(MichaelSize.orbLarge * HALO_SCALE).clearAndSetSemantics {},
                contentAlignment = Alignment.Center,
            ) {
                Box(Modifier.fillMaxSize().alpha(OUTER_RING_ALPHA).border(1.dp, colors.chipBorder, CircleShape))
                Box(Modifier.fillMaxSize().padding(MichaelSpace.xl).border(1.dp, colors.chipBorder, CircleShape))
                MichaelOrb(MichaelOrbSize.Large)
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(MichaelSpace.md)) {
                MichaelText(
                    stringResource(R.string.welcome_title),
                    MichaelTextStyle.Display,
                    colors.text,
                    Modifier.semantics { heading() },
                    textAlign = TextAlign.Center,
                )
                MichaelText(stringResource(R.string.welcome_message), MichaelTextStyle.Body, colors.muted, textAlign = TextAlign.Center)
            }
        }
    }
}

private const val HALO_SCALE = 1.75f
private const val OUTER_RING_ALPHA = 0.5f

@PreviewLightDark
@Composable
private fun WelcomePreview() {
    MichaelTheme { WelcomeScreen("https://example.com/terms", "https://example.com/privacy", {}, {}) }
}
