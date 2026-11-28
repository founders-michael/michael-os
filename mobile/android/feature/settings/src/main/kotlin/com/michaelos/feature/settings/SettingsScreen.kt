package com.michaelos.feature.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.NavKey
import com.michaelos.core.data.Appearance
import com.michaelos.core.designsystem.component.FailureStateView
import com.michaelos.core.designsystem.component.MichaelBackButton
import com.michaelos.core.designsystem.component.MichaelBackground
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelCard
import com.michaelos.core.designsystem.component.MichaelSegmentedControl
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.Account
import kotlinx.serialization.Serializable

/** The pages behind the Settings list. */
enum class SettingsPage { Account, Context, Licences, Delete }

@Serializable
data class SettingsPageKey(
    val page: SettingsPage,
) : NavKey

/** What Settings needs from the app. */
class SettingsActions(
    val open: (SettingsPageKey) -> Unit,
    val back: () -> Unit,
    /** Ends the session on this device; the app returns to Welcome. */
    val signOut: () -> Unit,
    val termsUrl: String,
    val privacyUrl: String,
    /** "0.1.0 (1)": the app's version name and build. */
    val version: String,
)

/** Settings, pushed from More. */
@Composable
fun SettingsScreen(
    actions: SettingsActions,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val appearance by viewModel.appearance.collectAsStateWithLifecycle()
    // Runs again each time the list is shown, so a name saved on the account page appears here.
    LaunchedEffect(Unit) { viewModel.load() }
    SettingsPageFrame(stringResource(R.string.settings_title), actions.back) {
        when (val current = state) {
            SettingsUiState.Loading -> Loading()
            is SettingsUiState.Failed -> FailureStateView(current.error.message(), viewModel::load, Modifier.align(Alignment.Center))
            is SettingsUiState.Content -> SettingsList(current.account, appearance, viewModel, actions)
        }
    }
}

@Composable
private fun SettingsList(
    account: Account,
    appearance: Appearance,
    viewModel: SettingsViewModel,
    actions: SettingsActions,
) {
    val colors = MichaelTheme.colors
    val uri = LocalUriHandler.current
    var confirmingSignOut by rememberSaveable { mutableStateOf(false) }
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.md),
        verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg),
    ) {
        MichaelCard(Modifier.clickable(role = Role.Button) { actions.open(SettingsPageKey(SettingsPage.Account)) }) {
            Row(Modifier.padding(MichaelSpace.md), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(MichaelSize.checkTouch).background(colors.fill, CircleShape), contentAlignment = Alignment.Center) {
                    MichaelText(account.identity.initials, MichaelTextStyle.Heading, colors.onfill)
                }
                Column(Modifier.weight(1f).padding(start = MichaelSpace.md), verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
                    MichaelText(account.fullName, MichaelTextStyle.Heading, colors.text)
                    MichaelText(account.email, MichaelTextStyle.Caption, colors.muted)
                }
            }
        }
        Section(stringResource(R.string.settings_section_michael)) {
            LinkRow(stringResource(R.string.settings_context)) { actions.open(SettingsPageKey(SettingsPage.Context)) }
        }
        Section(stringResource(R.string.settings_appearance)) {
            MichaelSegmentedControl(
                options = Appearance.entries,
                selected = appearance,
                onSelect = viewModel::setAppearance,
                title = { appearanceText(it) },
            )
        }
        Section(stringResource(R.string.settings_section_about)) {
            LinkRow(stringResource(R.string.settings_privacy)) { uri.openUri(actions.privacyUrl) }
            LinkRow(stringResource(R.string.settings_terms)) { uri.openUri(actions.termsUrl) }
            LinkRow(stringResource(R.string.settings_licences)) { actions.open(SettingsPageKey(SettingsPage.Licences)) }
            Row(Modifier.padding(vertical = MichaelSpace.sm)) {
                MichaelText(stringResource(R.string.settings_version), MichaelTextStyle.Body, colors.text, Modifier.weight(1f))
                MichaelText(actions.version, MichaelTextStyle.Label, colors.muted)
            }
        }
        MichaelButton(
            stringResource(R.string.settings_sign_out),
            { confirmingSignOut = true },
            Modifier.fillMaxWidth(),
            style = MichaelButtonStyle.Secondary,
        )
        MichaelButton(
            stringResource(R.string.settings_delete),
            { actions.open(SettingsPageKey(SettingsPage.Delete)) },
            Modifier.fillMaxWidth(),
            style = MichaelButtonStyle.Destructive,
        )
    }
    if (confirmingSignOut) {
        AlertDialog(
            onDismissRequest = { confirmingSignOut = false },
            title = { Text(stringResource(R.string.settings_sign_out_title)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmingSignOut = false
                    actions.signOut()
                }) { Text(stringResource(R.string.settings_sign_out), color = colors.danger) }
            },
            dismissButton = {
                TextButton(onClick = { confirmingSignOut = false }) { Text(stringResource(R.string.settings_sign_out_keep)) }
            },
        )
    }
}

@Composable
private fun Section(
    title: String,
    content: @Composable () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
        MichaelText(title, MichaelTextStyle.Eyebrow, MichaelTheme.colors.muted, Modifier.semantics { heading() })
        content()
    }
}

@Composable
private fun LinkRow(
    title: String,
    onClick: () -> Unit,
) {
    MichaelText(
        title,
        MichaelTextStyle.Body,
        MichaelTheme.colors.text,
        Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = onClick)
            .padding(vertical = MichaelSpace.md),
    )
}

/** The frame every Settings page shares: back, title and an optional action on the right. */
@Composable
internal fun SettingsPageFrame(
    title: String,
    onBack: () -> Unit,
    action: @Composable () -> Unit = {},
    content: @Composable BoxScope.() -> Unit,
) {
    MichaelBackground(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = MichaelSpace.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                MichaelBackButton(onBack)
                MichaelText(title, MichaelTextStyle.Label, MichaelTheme.colors.text, Modifier.weight(1f).semantics { heading() })
                action()
            }
            Box(Modifier.weight(1f).fillMaxWidth(), content = content)
        }
    }
}

@Composable
internal fun BoxScope.Loading() {
    val label = stringResource(R.string.settings_loading)
    CircularProgressIndicator(Modifier.align(Alignment.Center).semantics { contentDescription = label }, color = MichaelTheme.colors.accent)
}
