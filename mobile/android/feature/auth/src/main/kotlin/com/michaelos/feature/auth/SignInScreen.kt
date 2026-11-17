package com.michaelos.feature.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.michaelos.core.designsystem.component.ErrorBanner
import com.michaelos.core.designsystem.component.MichaelBackButton
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelPage
import com.michaelos.core.designsystem.component.MichaelTextField
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme

@Composable
fun SignInScreen(
    onBack: () -> Unit,
    onRegister: () -> Unit,
    onNeedsVerification: (String) -> Unit,
    viewModel: SignInViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(state) {
        val current = state
        if (current is SignInUiState.NeedsVerification) {
            onNeedsVerification(current.email)
            viewModel.verificationShown()
        }
    }
    val submit = { if (SignInViewModel.canSubmit(email, password)) viewModel.signIn(email, password) }
    MichaelPage(
        footer = {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                MichaelText(stringResource(R.string.sign_in_new_here), MichaelTextStyle.Label, MichaelTheme.colors.muted)
                MichaelButton(stringResource(R.string.sign_in_register), onRegister, style = MichaelButtonStyle.Ghost)
            }
        },
    ) {
        MichaelBackButton(onBack)
        AuthHeading(stringResource(R.string.sign_in_title), stringResource(R.string.sign_in_message))
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg)) {
            val current = state
            if (current is SignInUiState.Failed) ErrorBanner(current.error.authMessage())
            MichaelTextField(
                stringResource(R.string.field_email),
                email,
                { email = it },
                keyboardType = KeyboardType.Email,
                autofill = ContentType.Username + ContentType.EmailAddress,
            )
            MichaelTextField(
                stringResource(R.string.field_password),
                password,
                { password = it },
                isSecure = true,
                autofill = ContentType.Password,
            )
            MichaelButton(
                stringResource(if (state == SignInUiState.Submitting) R.string.sign_in_submitting else R.string.sign_in_submit),
                submit,
                Modifier.fillMaxWidth(),
                enabled = SignInViewModel.canSubmit(email, password) && state != SignInUiState.Submitting,
            )
        }
    }
}
