package com.michaelos.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
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
) {
    val colors = MichaelTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
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
            textStyle = MichaelTextStyle.Body.textStyle.copy(color = colors.text),
            cursorBrush = SolidColor(colors.accent),
            interactionSource = interaction,
            modifier =
                Modifier
                    .fillMaxWidth()
                    .semantics {
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
                ) { field() }
            },
        )
        if (error != null) {
            MichaelText(error, MichaelTextStyle.Caption, colors.danger)
        }
    }
}
