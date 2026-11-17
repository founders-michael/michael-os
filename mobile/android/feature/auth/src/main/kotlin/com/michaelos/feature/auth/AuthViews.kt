package com.michaelos.feature.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.fromHtml
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme

@Composable
internal fun AuthHeading(
    title: String,
    message: String,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        MichaelText(title, MichaelTextStyle.Display, MichaelTheme.colors.text, Modifier.semantics { heading() })
        MichaelText(message, MichaelTextStyle.Body, MichaelTheme.colors.muted)
    }
}

/** A footnote whose string resource holds HTML links, such as "agree to the Terms of Service and Privacy Policy". */
@Composable
internal fun LegalText(html: String) {
    val colors = MichaelTheme.colors
    Text(
        text =
            AnnotatedString.fromHtml(
                html,
                linkStyles = TextLinkStyles(SpanStyle(color = colors.atext, textDecoration = TextDecoration.Underline)),
            ),
        style = MichaelTextStyle.Caption.textStyle.copy(color = colors.muted, textAlign = TextAlign.Center),
        modifier = Modifier.fillMaxWidth(),
    )
}
