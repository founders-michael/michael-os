package com.michaelos.feature.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.michaelos.core.designsystem.component.ErrorBanner
import com.michaelos.core.designsystem.component.MichaelBackButton
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelPage
import com.michaelos.core.designsystem.component.MichaelTextField
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme

@Composable
fun RegisterScreen(
    termsUrl: String,
    privacyUrl: String,
    onBack: () -> Unit,
    onRegistered: (String) -> Unit,
    viewModel: RegisterViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(state) {
        val current = state
        if (current is RegisterUiState.Registered) {
            onRegistered(current.email)
            viewModel.confirmationShown()
        }
    }
    MichaelPage(footer = { LegalText(stringResource(R.string.register_legal, termsUrl, privacyUrl)) }) {
        MichaelBackButton(onBack)
        AuthHeading(stringResource(R.string.register_title), stringResource(R.string.register_message))
        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg)) {
            val current = state
            if (current is RegisterUiState.Failed) ErrorBanner(current.error.authMessage())
            MichaelTextField(stringResource(R.string.field_name), name, { name = it }, autofill = ContentType.PersonFullName)
            MichaelTextField(
                stringResource(R.string.field_email),
                email,
                { email = it },
                keyboardType = KeyboardType.Email,
                autofill = ContentType.Username + ContentType.EmailAddress,
            )
            Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
                MichaelTextField(
                    stringResource(R.string.field_password),
                    password,
                    { password = it },
                    isSecure = true,
                    autofill = ContentType.NewPassword,
                )
                PasswordRuleList(PasswordRules.of(password))
            }
            MichaelButton(
                stringResource(if (state == RegisterUiState.Submitting) R.string.register_submitting else R.string.register_submit),
                { viewModel.register(name, email, password) },
                Modifier.fillMaxWidth(),
                enabled = RegisterViewModel.canSubmit(name, email, password) && state != RegisterUiState.Submitting,
            )
        }
    }
}

@Composable
private fun PasswordRuleList(rules: PasswordRules) {
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
        RuleRow(
            rules.hasLength,
            pluralStringResource(R.plurals.register_rule_length, rules.length, PasswordRules.MINIMUM_LENGTH, rules.length),
        )
        RuleRow(rules.hasUppercase, stringResource(R.string.register_rule_uppercase))
        RuleRow(rules.hasLowercase, stringResource(R.string.register_rule_lowercase))
    }
}

@Composable
private fun RuleRow(
    met: Boolean,
    text: String,
) {
    val colors = MichaelTheme.colors
    val spoken = stringResource(if (met) R.string.register_rule_met else R.string.register_rule_not_met)
    Row(
        modifier = Modifier.semantics(mergeDescendants = true) { stateDescription = spoken },
        horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(MichaelSize.check / 2)
                .then(if (met) Modifier.background(colors.accent, CircleShape) else Modifier.border(1.dp, colors.faint, CircleShape)),
        )
        MichaelText(text, MichaelTextStyle.Caption, if (met) colors.text else colors.muted)
    }
}
