package com.michaelos.core.designsystem.component

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.contentType
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.michaelos.core.designsystem.R
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme

@Composable
fun MichaelTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    error: String? = null,
    isSecure: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text,
    autofill: ContentType? = null,
    keyboardActions: KeyboardActions = KeyboardActions.Default,
    imeAction: ImeAction = ImeAction.Default,
) {
    val colors = MichaelTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    var revealed by rememberSaveable { mutableStateOf(false) }
    val shape = RoundedCornerShape(MichaelRadius.field)
    val borderColor =
        when {
            error != null -> colors.danger
            focused -> colors.accent
            else -> colors.border2
        }
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
        MichaelText(label, MichaelTextStyle.Label, if (error == null) colors.muted else colors.danger)
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            keyboardActions = keyboardActions,
            visualTransformation = if (isSecure && !revealed) PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions =
                KeyboardOptions(
                    imeAction = imeAction,
                    keyboardType = if (isSecure) KeyboardType.Password else keyboardType,
                    capitalization =
                        if (keyboardType ==
                            KeyboardType.Text
                        ) {
                            KeyboardCapitalization.Sentences
                        } else {
                            KeyboardCapitalization.None
                        },
                    autoCorrectEnabled = keyboardType == KeyboardType.Text && !isSecure,
                ),
            textStyle = MichaelTextStyle.Body.textStyle.copy(color = colors.text),
            cursorBrush = SolidColor(colors.accent),
            interactionSource = interaction,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .semantics {
                        if (autofill != null) contentType = autofill
                        contentDescription = label
                        if (error != null) error(error)
                    },
            decorationBox = { field ->
                Box(
                    modifier =
                        Modifier
                            .defaultMinSize(minHeight = MichaelSize.field)
                            .background(colors.solid, shape)
                            .border(1.dp, borderColor, shape)
                            .padding(horizontal = MichaelSpace.md),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (isSecure) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(modifier = Modifier.weight(1f)) { field() }
                            RevealButton(revealed) { revealed = !revealed }
                        }
                    } else {
                        field()
                    }
                }
            },
        )
        if (error != null) {
            MichaelText(error, MichaelTextStyle.Caption, colors.danger)
        }
    }
}

@Composable
private fun RevealButton(
    revealed: Boolean,
    onToggle: () -> Unit,
) {
    val label = stringResource(if (revealed) R.string.field_hide_password else R.string.field_show_password)
    val color = MichaelTheme.colors.muted
    Box(
        modifier =
            Modifier
                .size(MichaelSize.checkTouch)
                .clickable(onClickLabel = label, role = Role.Button, onClick = onToggle)
                .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.size(MichaelSize.check * EYE_SCALE)) {
            val stroke = Stroke(width = size.width / EYE_STROKE_DIVISOR)
            drawOval(color, topLeft = Offset(0f, size.height * EYE_TOP), size = Size(size.width, size.height * EYE_HEIGHT), style = stroke)
            drawCircle(color, radius = size.width * PUPIL, style = stroke)
            if (revealed) drawLine(color, Offset(0f, size.height), Offset(size.width, 0f), strokeWidth = stroke.width)
        }
    }
}

private const val EYE_SCALE = 0.85f
private const val EYE_STROKE_DIVISOR = 12f
private const val EYE_TOP = 0.2f
private const val EYE_HEIGHT = 0.6f
private const val PUPIL = 0.16f
