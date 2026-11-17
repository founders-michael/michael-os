package com.michaelos.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.michaelos.core.data.AuthRepository
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Outcome
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface SignInUiState {
    data object Idle : SignInUiState

    data object Submitting : SignInUiState

    data class Failed(
        val error: AppError,
    ) : SignInUiState

    /**
     * The account exists but its email is not verified. The server has sent a fresh link; the screen moves to
     * Check your email and then calls `verificationShown()`.
     */
    data class NeedsVerification(
        val email: String,
    ) : SignInUiState
}

@HiltViewModel
class SignInViewModel
    @Inject
    constructor(
        private val auth: AuthRepository,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<SignInUiState>(SignInUiState.Idle)
        val uiState: StateFlow<SignInUiState> = mutableState.asStateFlow()

        /**
         * A successful sign-in changes the session, and the app moves on from there; this screen only reports
         * failures. A second tap while one is in flight is ignored.
         */
        fun signIn(
            email: String,
            password: String,
        ) {
            if (mutableState.value == SignInUiState.Submitting) return
            val address = email.trim()
            mutableState.value = SignInUiState.Submitting
            viewModelScope.launch {
                mutableState.value =
                    when (val outcome = auth.signIn(address, password)) {
                        is Outcome.Success -> {
                            SignInUiState.Idle
                        }

                        is Outcome.Failure -> {
                            val error = outcome.error
                            if (error is AppError.Forbidden && error.server.code == EMAIL_NOT_VERIFIED) {
                                SignInUiState.NeedsVerification(address)
                            } else {
                                SignInUiState.Failed(error)
                            }
                        }
                    }
            }
        }

        fun verificationShown() {
            mutableState.value = SignInUiState.Idle
        }

        companion object {
            private const val EMAIL_NOT_VERIFIED = "EMAIL_NOT_VERIFIED"

            fun canSubmit(
                email: String,
                password: String,
            ) = email.trim().contains('@') && password.isNotEmpty()
        }
    }
