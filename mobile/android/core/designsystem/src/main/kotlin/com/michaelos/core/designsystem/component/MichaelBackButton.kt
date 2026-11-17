package com.michaelos.core.designsystem.component

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.michaelos.core.designsystem.R
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelTheme

/** The back chevron the mocks draw at the top left. System back does the same thing. */
@Composable
fun MichaelBackButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val label = stringResource(R.string.navigation_back)
    val color = MichaelTheme.colors.muted
    Box(
        modifier =
            modifier
                .size(MichaelSize.checkTouch)
                .clickable(role = Role.Button, onClickLabel = label, onClick = onClick)
                .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.size(MichaelSize.check)) {
            val stroke = size.width / STROKE_DIVISOR
            val right = size.width * RIGHT
            val left = size.width * LEFT
            drawLine(color, Offset(right, size.height * TOP), Offset(left, size.height / 2), stroke, StrokeCap.Round)
            drawLine(color, Offset(left, size.height / 2), Offset(right, size.height * BOTTOM), stroke, StrokeCap.Round)
        }
    }
}

private const val STROKE_DIVISOR = 12f
private const val RIGHT = 0.62f
private const val LEFT = 0.38f
private const val TOP = 0.25f
private const val BOTTOM = 0.75f
