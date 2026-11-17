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

sealed interface RegisterUiState {
    data object Idle : RegisterUiState

    data object Submitting : RegisterUiState

    data class Failed(
        val error: AppError,
    ) : RegisterUiState

    /**
     * The account was created, or the address was already registered: the server answers both the same way. The
     * screen moves to Check your email and calls `confirmationShown()`.
     */
    data class Registered(
        val email: String,
    ) : RegisterUiState
}

@HiltViewModel
class RegisterViewModel
    @Inject
    constructor(
        private val auth: AuthRepository,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<RegisterUiState>(RegisterUiState.Idle)
        val uiState: StateFlow<RegisterUiState> = mutableState.asStateFlow()

        fun register(
            name: String,
            email: String,
            password: String,
        ) {
            if (mutableState.value == RegisterUiState.Submitting || !canSubmit(name, email, password)) return
            val address = email.trim()
            mutableState.value = RegisterUiState.Submitting
            viewModelScope.launch {
                mutableState.value =
                    when (val outcome = auth.register(name.trim(), address, password)) {
                        is Outcome.Success -> RegisterUiState.Registered(address)
                        is Outcome.Failure -> RegisterUiState.Failed(outcome.error)
                    }
            }
        }

        fun confirmationShown() {
            mutableState.value = RegisterUiState.Idle
        }

        companion object {
            fun canSubmit(
                name: String,
                email: String,
                password: String,
            ) = name.isNotBlank() && email.trim().contains('@') && PasswordRules.of(password).isMet
        }
    }
