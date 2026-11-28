package com.michaelos.feature.settings

import android.graphics.BitmapFactory
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.Account

/**
 * The user's picture: an upload read with the session, or the initials. A sign-in provider's picture is a public URL
 * the app has no image loader for yet; it shows the initials until Google sign-in lands.
 */
@Composable
internal fun Avatar(
    initials: String,
    picture: ByteArray?,
    size: Dp,
) {
    val colors = MichaelTheme.colors
    val bitmap = remember(picture) { picture?.let { BitmapFactory.decodeByteArray(it, 0, it.size)?.asImageBitmap() } }
    Box(
        Modifier
            .size(size)
            .clip(CircleShape)
            .background(colors.raise)
            .border(1.dp, colors.border2, CircleShape)
            .clearAndSetSemantics {},
        contentAlignment = Alignment.Center,
    ) {
        if (bitmap != null) {
            Image(bitmap, null, Modifier.size(size), contentScale = ContentScale.Crop)
        } else {
            MichaelText(initials, MichaelTextStyle.Heading, colors.text)
        }
    }
}

/** The picture on the Account screen, with change and remove. */
@Composable
internal fun AccountPictureRow(
    account: Account,
    state: AccountEditorUiState,
    viewModel: AccountEditorViewModel,
) {
    val colors = MichaelTheme.colors
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let(viewModel::upload) }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MichaelSpace.lg)) {
        Avatar(account.identity.initials, state.picture, MichaelSize.avatar)
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
            MichaelText(
                stringResource(R.string.settings_account_change_picture),
                MichaelTextStyle.Button,
                if (state.saving) colors.faint else colors.atext,
                Modifier
                    .heightIn(min = MichaelSize.checkTouch)
                    .clickable(enabled = !state.saving, role = Role.Button) {
                        picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                    },
            )
            if (account.hasCustomImage) {
                MichaelText(
                    stringResource(R.string.settings_account_remove_picture),
                    MichaelTextStyle.Button,
                    if (state.saving) colors.faint else colors.danger,
                    Modifier
                        .heightIn(
                            min = MichaelSize.checkTouch,
                        ).clickable(enabled = !state.saving, role = Role.Button, onClick = viewModel::removePicture),
                )
            }
            MichaelText(
                stringResource(
                    if (state.pictureRefused) R.string.settings_account_picture_refused else R.string.settings_account_picture_rules,
                ),
                MichaelTextStyle.Caption,
                if (state.pictureRefused) colors.danger else colors.faint,
            )
        }
    }
}
