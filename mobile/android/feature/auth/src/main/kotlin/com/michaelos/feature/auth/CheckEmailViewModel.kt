package com.michaelos.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.michaelos.core.data.AuthRepository
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Outcome
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface CheckEmailUiState {
    /** A link was just sent, so Resend waits. Seconds left until it is offered. */
    data class CoolingDown(
        val seconds: Int,
    ) : CheckEmailUiState

    data object Ready : CheckEmailUiState

    data object Sending : CheckEmailUiState

    data class Failed(
        val error: AppError,
    ) : CheckEmailUiState
}

@HiltViewModel(assistedFactory = CheckEmailViewModel.Factory::class)
class CheckEmailViewModel
    @AssistedInject
    constructor(
        @Assisted val email: String,
        private val auth: AuthRepository,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<CheckEmailUiState>(CheckEmailUiState.CoolingDown(COOLDOWN_SECONDS))
        val uiState: StateFlow<CheckEmailUiState> = mutableState.asStateFlow()
        private var countdown: Job? = null

        init {
            coolDown()
        }

        fun resend() {
            val state = mutableState.value
            if (state !is CheckEmailUiState.Ready && state !is CheckEmailUiState.Failed) return
            mutableState.value = CheckEmailUiState.Sending
            viewModelScope.launch {
                when (val outcome = auth.resendVerification(email)) {
                    is Outcome.Success -> coolDown()
                    is Outcome.Failure -> mutableState.value = CheckEmailUiState.Failed(outcome.error)
                }
            }
        }

        private fun coolDown() {
            countdown?.cancel()
            mutableState.value = CheckEmailUiState.CoolingDown(COOLDOWN_SECONDS)
            countdown =
                viewModelScope.launch {
                    for (left in COOLDOWN_SECONDS - 1 downTo 0) {
                        delay(SECOND_MS)
                        mutableState.value = if (left > 0) CheckEmailUiState.CoolingDown(left) else CheckEmailUiState.Ready
                    }
                }
        }

        @AssistedFactory
        interface Factory {
            fun create(email: String): CheckEmailViewModel
        }

        companion object {
            /** The web app waits the same time between resends; the server also limits them. */
            const val COOLDOWN_SECONDS = 30
            private const val SECOND_MS = 1_000L
        }
    }
