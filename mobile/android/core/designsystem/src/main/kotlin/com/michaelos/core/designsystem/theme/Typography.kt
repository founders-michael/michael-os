package com.michaelos.core.designsystem.theme

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.michaelos.core.designsystem.R

// Mirrors type in mobile/design/tokens.json; TokenDriftTest fails if they differ.
enum class MichaelTextStyle(
    internal val key: String,
    internal val size: Int,
    internal val weight: Int,
    internal val tracking: Float,
    internal val lineHeight: Float?,
    internal val uppercase: Boolean = false,
    internal val mono: Boolean = false,
) {
    Display("display", 32, 600, -0.035f, 1.05f),
    Title("title", 22, 600, -0.02f, 1.2f),
    Heading("heading", 19, 600, -0.02f, 1.25f),
    Body("body", 16, 400, 0f, 1.45f),
    Label("label", 14, 500, 0f, 1.35f),
    Button("button", 15, 600, 0f, 1.2f),
    Caption("caption", 12, 500, 0f, 1.3f),
    Eyebrow("eyebrow", 11, 600, 0.14f, null, uppercase = true),
    Stat("stat", 26, 600, -0.02f, null, mono = true),
    ;

    val textStyle: TextStyle by lazy {
        TextStyle(
            fontFamily = if (mono) geistMono else geist,
            fontWeight = FontWeight(weight),
            fontSize = size.sp,
            letterSpacing = tracking.em,
            lineHeight = lineHeight?.em ?: TextStyle.Default.lineHeight,
        )
    }
}

private val geist =
    FontFamily(
        Font(R.font.geist_regular, FontWeight.Normal),
        Font(R.font.geist_medium, FontWeight.Medium),
        Font(R.font.geist_semi_bold, FontWeight.SemiBold),
    )

private val geistMono =
    FontFamily(
        Font(R.font.geist_mono_regular, FontWeight.Normal),
        Font(R.font.geist_mono_medium, FontWeight.Medium),
        Font(R.font.geist_mono_semi_bold, FontWeight.SemiBold),
    )

@Composable
fun MichaelText(
    text: String,
    style: MichaelTextStyle,
    color: Color,
    modifier: Modifier = Modifier,
    textAlign: TextAlign? = null,
    maxLines: Int = Int.MAX_VALUE,
    textDecoration: TextDecoration? = null,
) {
    Text(
        text = if (style.uppercase) text.uppercase() else text,
        modifier = modifier,
        style = style.textStyle,
        color = color,
        textAlign = textAlign,
        maxLines = maxLines,
        overflow = TextOverflow.Ellipsis,
        textDecoration = textDecoration,
    )
}
