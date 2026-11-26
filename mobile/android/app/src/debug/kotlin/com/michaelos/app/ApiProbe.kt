package com.michaelos.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.michaelos.core.auth.Authenticator
import com.michaelos.core.auth.Session
import com.michaelos.core.auth.SessionState
import com.michaelos.core.data.TaskRepository
import com.michaelos.core.designsystem.component.EmptyStateView
import com.michaelos.core.designsystem.component.FailureStateView
import com.michaelos.core.designsystem.component.MichaelBackground
import com.michaelos.core.designsystem.component.MichaelButton
import com.michaelos.core.designsystem.component.MichaelButtonStyle
import com.michaelos.core.designsystem.component.MichaelCard
import com.michaelos.core.designsystem.component.MichaelTextField
import com.michaelos.core.designsystem.theme.MichaelSpace
import com.michaelos.core.designsystem.theme.MichaelText
import com.michaelos.core.designsystem.theme.MichaelTextStyle
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.Task
import com.michaelos.core.model.TaskQuery
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface ApiProbeUiState {
    data object Restoring : ApiProbeUiState

    data class SignedOut(
        val error: AppError?,
    ) : ApiProbeUiState

    data object SigningIn : ApiProbeUiState

    data object Loading : ApiProbeUiState

    data class Content(
        val tasks: List<Task>,
    ) : ApiProbeUiState

    data object Empty : ApiProbeUiState

    data class Failed(
        val error: AppError,
    ) : ApiProbeUiState
}

/** Signs in against the configured server with a typed-in account and lists task titles. Debug builds only. */
@HiltViewModel
class ApiProbeViewModel
    @Inject
    constructor(
        private val session: Session,
        private val authenticator: Authenticator,
        private val tasks: TaskRepository,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<ApiProbeUiState>(ApiProbeUiState.Restoring)
        val uiState: StateFlow<ApiProbeUiState> = mutableState.asStateFlow()

        init {
            viewModelScope.launch {
                session.state.collect { state ->
                    when (state) {
                        SessionState.Restoring -> {
                            mutableState.value = ApiProbeUiState.Restoring
                        }

                        SessionState.SignedIn -> {
                            load()
                        }

                        SessionState.SignedOut -> {
                            if (mutableState.value !is ApiProbeUiState.SignedOut) mutableState.value = ApiProbeUiState.SignedOut(null)
                        }
                    }
                }
            }
        }

        fun signIn(
            email: String,
            password: String,
        ) {
            if (mutableState.value == ApiProbeUiState.SigningIn) return
            mutableState.value = ApiProbeUiState.SigningIn
            viewModelScope.launch {
                val outcome = authenticator.signIn(email, password)
                if (outcome is Outcome.Failure) mutableState.value = ApiProbeUiState.SignedOut(outcome.error)
            }
        }

        fun signOut() {
            viewModelScope.launch { authenticator.signOut() }
        }

        fun load() {
            mutableState.value = ApiProbeUiState.Loading
            viewModelScope.launch {
                mutableState.value =
                    when (val outcome = tasks.list(TaskQuery())) {
                        is Outcome.Success -> {
                            if (outcome.value.tasks.isEmpty()) ApiProbeUiState.Empty else ApiProbeUiState.Content(outcome.value.tasks)
                        }

                        is Outcome.Failure -> {
                            if (session.state.value == SessionState.SignedOut) {
                                ApiProbeUiState.SignedOut(outcome.error)
                            } else {
                                ApiProbeUiState.Failed(outcome.error)
                            }
                        }
                    }
            }
        }
    }

@Composable
fun ApiProbeScreen(viewModel: ApiProbeViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    ApiProbeContent(state, onSignIn = viewModel::signIn, onReload = viewModel::load, onSignOut = viewModel::signOut)
}

@Composable
private fun ApiProbeContent(
    state: ApiProbeUiState,
    onSignIn: (String, String) -> Unit,
    onReload: () -> Unit,
    onSignOut: () -> Unit,
) {
    val colors = MichaelTheme.colors
    // Held above the state switch so a failed sign-in keeps what was typed.
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    MichaelBackground(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
                    .windowInsetsPadding(WindowInsets.statusBars)
                    .padding(MichaelSpace.screenGutter),
            verticalArrangement = Arrangement.spacedBy(MichaelSpace.lg),
        ) {
            MichaelText(
                stringResource(R.string.debug_api_title),
                MichaelTextStyle.Title,
                colors.text,
                Modifier.semantics { heading() },
            )
            when (state) {
                is ApiProbeUiState.SignedOut -> {
                    SignInForm(email, { email = it }, password, { password = it }, state.error) { onSignIn(email, password) }
                }

                ApiProbeUiState.Restoring, ApiProbeUiState.SigningIn, ApiProbeUiState.Loading -> {
                    CircularProgressIndicator(color = colors.accent, modifier = Modifier.align(Alignment.CenterHorizontally))
                }

                is ApiProbeUiState.Content -> {
                    MichaelCard(modifier = Modifier.fillMaxWidth()) {
                        Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.md)) {
                            state.tasks.forEach { MichaelText(it.title, MichaelTextStyle.Body, colors.text) }
                        }
                    }
                    SignedInActions(onReload, onSignOut)
                }

                ApiProbeUiState.Empty -> {
                    EmptyStateView(
                        title = stringResource(R.string.debug_api_empty_title),
                        message = stringResource(R.string.debug_api_empty_message),
                        actionText = stringResource(R.string.debug_api_reload),
                        onAction = onReload,
                    )
                    SignedInActions(onReload, onSignOut)
                }

                is ApiProbeUiState.Failed -> {
                    FailureStateView(message = message(state.error), onRetry = onReload)
                    SignedInActions(onReload, onSignOut)
                }
            }
        }
    }
}

@Composable
private fun SignInForm(
    email: String,
    onEmailChange: (String) -> Unit,
    password: String,
    onPasswordChange: (String) -> Unit,
    error: AppError?,
    onSignIn: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MichaelSpace.md)) {
        MichaelTextField(stringResource(R.string.debug_api_email), email, onEmailChange)
        MichaelTextField(stringResource(R.string.debug_api_password), password, onPasswordChange, isSecure = true)
        if (error != null) MichaelText(message(error), MichaelTextStyle.Label, MichaelTheme.colors.danger)
        MichaelButton(
            stringResource(R.string.debug_api_sign_in),
            onClick = onSignIn,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun SignedInActions(
    onReload: () -> Unit,
    onSignOut: () -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(MichaelSpace.sm)) {
        MichaelButton(stringResource(R.string.debug_api_reload), onReload, Modifier.weight(1f), MichaelButtonStyle.Secondary)
        MichaelButton(stringResource(R.string.debug_api_sign_out), onSignOut, Modifier.weight(1f), MichaelButtonStyle.Ghost)
    }
}

@Composable
private fun message(error: AppError): String =
    when (error) {
        AppError.Offline -> stringResource(R.string.debug_api_error_offline)
        AppError.Timeout -> stringResource(R.string.debug_api_error_timeout)
        AppError.Decoding -> stringResource(R.string.debug_api_error_generic)
        is AppError.Unauthorized -> error.server.text
        is AppError.Forbidden -> error.server.text
        is AppError.NotFound -> error.server.text
        is AppError.Conflict -> error.server.text
        is AppError.Validation -> error.server.text
        is AppError.RateLimited -> error.server.text
        is AppError.Server -> error.server.text
    } ?: stringResource(R.string.debug_api_error_generic)
