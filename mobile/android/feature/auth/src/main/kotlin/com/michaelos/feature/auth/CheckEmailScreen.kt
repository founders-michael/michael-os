package com.michaelos.feature.auth

import android.content.ActivityNotFoundException
import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.michaelos.core.designsystem.component.ErrorBanner
import com.michaelos.core.designsystem.component.MichaelBackButton
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelPage
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme

@Composable
fun CheckEmailScreen(
    email: String,
    onBack: () -> Unit,
    onSignIn: () -> Unit,
    viewModel: CheckEmailViewModel =
        hiltViewModel<CheckEmailViewModel, CheckEmailViewModel.Factory>(key = email) { it.create(email) },
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val colors = MichaelTheme.colors
    MichaelPage(
        footer = {
            MichaelButton(stringResource(R.string.check_email_open_mail), {
                val mail = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_APP_EMAIL).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                try {
                    context.startActivity(mail)
                } catch (_: ActivityNotFoundException) {
                    // No mail app on this device: the button does nothing, and the screen still explains what to do.
                }
            }, Modifier.fillMaxWidth())
            MichaelButton(stringResource(R.string.check_email_sign_in), onSignIn, Modifier.fillMaxWidth(), MichaelButtonStyle.Secondary)
            val current = state
            MichaelButton(
                text =
                    when (current) {
                        is CheckEmailUiState.CoolingDown -> {
                            stringResource(
                                R.string.check_email_resend_in,
                                current.seconds / SECONDS_PER_MINUTE,
                                current.seconds % SECONDS_PER_MINUTE,
                            )
                        }

                        CheckEmailUiState.Sending -> {
                            stringResource(R.string.check_email_sending)
                        }

                        else -> {
                            stringResource(R.string.check_email_resend)
                        }
                    },
                onClick = viewModel::resend,
                modifier = Modifier.fillMaxWidth(),
                style = MichaelButtonStyle.Ghost,
                enabled = current is CheckEmailUiState.Ready || current is CheckEmailUiState.Failed,
            )
        },
    ) {
        MichaelBackButton(onBack)
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg)) {
            AuthHeading(stringResource(R.string.check_email_title), stringResource(R.string.check_email_sent_to))
            MichaelText(email, MichaelTextStyle.Heading, colors.text)
            MichaelText(stringResource(R.string.check_email_message), MichaelTextStyle.Body, colors.muted)
            val current = state
            if (current is CheckEmailUiState.Failed) ErrorBanner(current.error.authMessage())
        }
    }
}

private const val SECONDS_PER_MINUTE = 60
