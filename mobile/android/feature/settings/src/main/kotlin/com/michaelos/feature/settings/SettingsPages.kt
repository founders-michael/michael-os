package com.michaelos.feature.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.michaelos.core.designsystem.component.ErrorBanner
import com.michaelos.core.designsystem.component.FailureStateView
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonSize
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelCard
import com.michaelos.core.designsystem.component.MichaelTextField
import com.michaelos.core.designsystem.component.michaelFieldFrame
import com.michaelos.core.designsystem.theme.MichaelRadius
import com.michaelos.core.designsystem.theme.MichaelSize
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.PersonalContext

/** One Settings page, by its key. */
@Composable
fun SettingsPageScreen(
    key: SettingsPageKey,
    onBack: () -> Unit,
) {
    when (key.page) {
        SettingsPage.Account -> AccountPage(onBack)
        SettingsPage.Context -> ContextPage(onBack)
        SettingsPage.Routine -> RoutinePage(onBack)
        SettingsPage.Availability -> AvailabilityPage(onBack)
        SettingsPage.Licences -> LicencesPage(onBack)
        SettingsPage.Delete -> DeletePage(onBack)
    }
}

/** Picture, names, email and sign-in methods. A picture change applies at once; the names wait for Save. */
@Composable
private fun AccountPage(
    onBack: () -> Unit,
    viewModel: AccountEditorViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    LaunchedEffect(state.saved) { if (state.saved) onBack() }
    SettingsPageFrame(stringResource(R.string.settings_account), onBack, action = {
        SaveAction(state.saving, enabled = state.hasChanges, onSave = viewModel::save)
    }) {
        val account = state.account
        val form = state.form
        if (account == null || form == null) {
            state.failure?.let { FailureStateView(it.message(), onBack, Modifier.align(Alignment.Center)) } ?: Loading()
            return@SettingsPageFrame
        }
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.md),
            verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg),
        ) {
            state.failure?.let { ErrorBanner(it.message()) }
            AccountPictureRow(account, state, viewModel)
            MichaelTextField(
                label = stringResource(R.string.settings_account_full_name),
                value = form.fullName,
                onValueChange = { value -> viewModel.edit { it.copy(fullName = value) } },
                error = state.serverErrors["fullName"] ?: nameProblem(state.showsProblems, form.fullName),
            )
            MichaelTextField(
                label = stringResource(R.string.settings_account_preferred_name),
                value = form.preferredName,
                onValueChange = { value -> viewModel.edit { it.copy(preferredName = value) } },
                error = state.serverErrors["preferredName"] ?: nameProblem(state.showsProblems, form.preferredName),
            )
            ReadOnly(stringResource(R.string.settings_account_email), account.email)
            ReadOnly(stringResource(R.string.settings_account_methods), account.providers.map { providerText(it) }.joinToString(", "))
        }
    }
}

@Composable
private fun nameProblem(
    shows: Boolean,
    name: String,
): String? {
    if (!shows) return null
    return when (AccountForm.problem(name)) {
        AccountForm.Problem.Missing -> stringResource(R.string.settings_account_problem_missing)
        AccountForm.Problem.TooLong -> stringResource(R.string.settings_account_problem_long)
        null -> null
    }
}

@Composable
private fun ReadOnly(
    label: String,
    value: String,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.xs)) {
        MichaelText(label, MichaelTextStyle.Label, MichaelTheme.colors.muted)
        MichaelText(value, MichaelTextStyle.Body, MichaelTheme.colors.text)
    }
}

@Composable
internal fun SaveAction(
    saving: Boolean,
    enabled: Boolean,
    onSave: () -> Unit,
) {
    if (saving) {
        CircularProgressIndicator(Modifier.padding(MichaelSpace.md).size(MichaelSize.check), color = MichaelTheme.colors.accent)
    } else {
        TextButton(onClick = onSave, enabled = enabled) {
            Text(stringResource(R.string.settings_save), color = if (enabled) MichaelTheme.colors.atext else MichaelTheme.colors.faint)
        }
    }
}

/** My Context: what Michael reads about the user, with a live count against the limit. */
@Composable
private fun ContextPage(
    onBack: () -> Unit,
    viewModel: ContextEditorViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val colors = MichaelTheme.colors
    SettingsPageFrame(stringResource(R.string.settings_context), onBack, action = {
        SaveAction(
            state.saving,
            enabled = state.hasChanges && !state.draft.isTooLong && state.conflict == null && !state.loading,
            onSave = viewModel::save,
        )
    }) {
        val failure = state.loadFailure
        when {
            failure != null -> {
                FailureStateView(failure.message(), viewModel::load, Modifier.align(Alignment.Center))
            }

            state.loading -> {
                Loading()
            }

            else -> {
                Column(
                    Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.md),
                    verticalArrangement = Arrangement.spacedBy(MichaelSpace.md),
                ) {
                    MichaelText(stringResource(R.string.settings_context_intro), MichaelTextStyle.Body, colors.muted)
                    state.failure?.let { ErrorBanner(it.message()) }
                    state.conflict?.let { ConflictCard(it, viewModel) }
                    val label = stringResource(R.string.settings_context)
                    BasicTextField(
                        value = state.draft.text,
                        onValueChange = viewModel::edit,
                        minLines = 8,
                        textStyle = MichaelTextStyle.Body.textStyle.copy(color = colors.text),
                        cursorBrush = SolidColor(colors.accent),
                        modifier = Modifier.michaelFieldFrame().semantics { contentDescription = label },
                        decorationBox = { inner ->
                            Box {
                                if (state.draft.text.isEmpty()) {
                                    MichaelText(stringResource(R.string.settings_context_placeholder), MichaelTextStyle.Body, colors.faint)
                                }
                                inner()
                            }
                        },
                    )
                    MichaelText(
                        stringResource(R.string.settings_context_count, state.draft.count, ContextDraft.LIMIT),
                        MichaelTextStyle.Caption,
                        if (state.draft.isTooLong) colors.danger else colors.muted,
                    )
                }
            }
        }
    }
}

/** Saved on another device since this one loaded: the saved copy beside the user's, and the choice. */
@Composable
private fun ConflictCard(
    saved: PersonalContext,
    viewModel: ContextEditorViewModel,
) {
    val colors = MichaelTheme.colors
    MichaelCard {
        Column(Modifier.padding(MichaelSpace.md), verticalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
            MichaelText(stringResource(R.string.settings_context_conflict), MichaelTextStyle.Body, colors.text)
            MichaelText(stringResource(R.string.settings_context_conflict_saved), MichaelTextStyle.Label, colors.muted)
            MichaelText(
                saved.summary.ifEmpty { stringResource(R.string.settings_context_conflict_empty) },
                MichaelTextStyle.Body,
                colors.text,
                Modifier
                    .fillMaxWidth()
                    .background(colors.raise, RoundedCornerShape(MichaelRadius.field))
                    .padding(MichaelSpace.sm),
            )
            MichaelButton(stringResource(R.string.settings_context_keep_mine), viewModel::keepMine, size = MichaelButtonSize.Small)
            MichaelButton(
                stringResource(R.string.settings_context_use_saved),
                viewModel::useSaved,
                style = MichaelButtonStyle.Secondary,
                size = MichaelButtonSize.Small,
            )
        }
    }
}

/** Deleting the account. Required by both stores; it cannot be undone. */
@Composable
private fun DeletePage(
    onBack: () -> Unit,
    viewModel: DeleteAccountViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val colors = MichaelTheme.colors
    SettingsPageFrame(stringResource(R.string.settings_delete), onBack) {
        Column(
            Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.md),
            verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg),
        ) {
            MichaelText(stringResource(R.string.settings_delete_intro), MichaelTextStyle.Body, colors.text)
            MichaelText(stringResource(R.string.settings_delete_removed), MichaelTextStyle.Body, colors.muted)
            state.failure?.let { ErrorBanner(it.deleteMessage()) }
            MichaelTextField(
                label = stringResource(R.string.settings_delete_password),
                value = state.password,
                onValueChange = viewModel::password,
                isSecure = true,
            )
            MichaelTextField(
                label = stringResource(R.string.settings_delete_type, DeleteConfirmation.WORD),
                value = state.typed,
                onValueChange = viewModel::typed,
            )
            if (state.deleting) {
                CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally), color = colors.accent)
            } else {
                MichaelButton(
                    stringResource(R.string.settings_delete_confirm),
                    viewModel::delete,
                    Modifier.fillMaxWidth(),
                    style = MichaelButtonStyle.Destructive,
                    enabled = state.isReady,
                )
            }
        }
    }
}

@Composable
private fun LicencesPage(onBack: () -> Unit) {
    SettingsPageFrame(stringResource(R.string.settings_licences), onBack) {
        MichaelText(
            stringResource(R.string.settings_licences_android),
            MichaelTextStyle.Body,
            MichaelTheme.colors.text,
            Modifier.padding(horizontal = MichaelSpace.screenGutter, vertical = MichaelSpace.md),
        )
    }
}
