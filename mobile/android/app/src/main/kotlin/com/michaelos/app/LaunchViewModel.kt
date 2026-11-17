package com.michaelos.app

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.michaelos.core.auth.Authenticator
import com.michaelos.core.auth.Session
import com.michaelos.core.auth.SessionState
import com.michaelos.core.data.AuthRepository
import com.michaelos.core.data.ProfileRepository
import com.michaelos.core.model.Outcome
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface LaunchDestination {
    data object Checking : LaunchDestination

    data object SignedOut : LaunchDestination

    data class Onboarding(
        val suggestedName: String,
    ) : LaunchDestination

    data object Home : LaunchDestination
}

/** Decides the first screen, as drawn under "Launch" in mobile/design/flows.md, and again whenever the session changes. */
@HiltViewModel
class LaunchViewModel
    @Inject
    constructor(
        private val session: Session,
        private val authenticator: Authenticator,
        private val profiles: ProfileRepository,
        private val auth: AuthRepository,
    ) : ViewModel() {
        private val mutableDestination = MutableStateFlow<LaunchDestination>(LaunchDestination.Checking)
        val destination: StateFlow<LaunchDestination> = mutableDestination.asStateFlow()

        init {
            viewModelScope.launch { session.state.collectLatest(::route) }
        }

        fun onboardingFinished() {
            mutableDestination.value = LaunchDestination.Home
        }

        /** The session change routes back to Welcome. */
        fun signOut() {
            viewModelScope.launch { auth.signOut() }
        }

        private suspend fun route(state: SessionState) {
            when (state) {
                SessionState.Restoring -> {
                    mutableDestination.value = LaunchDestination.Checking
                }

                SessionState.SignedOut -> {
                    mutableDestination.value = LaunchDestination.SignedOut
                }

                SessionState.SignedIn -> {
                    mutableDestination.value = LaunchDestination.Checking
                    mutableDestination.value = signedInDestination()
                }
            }
        }

        // Offline at launch with a stored token opens the app rather than signing the user out; the screens show their
        // own offline state. A 401 has already ended the session, which routes again.
        private suspend fun signedInDestination(): LaunchDestination {
            val user =
                when (val check = authenticator.validateSession()) {
                    is Outcome.Failure -> return LaunchDestination.Home
                    is Outcome.Success -> check.value ?: return LaunchDestination.SignedOut
                }
            return when (val profile = profiles.profile()) {
                is Outcome.Failure -> {
                    LaunchDestination.Home
                }

                is Outcome.Success -> {
                    if (profile.value?.onboardingCompleted == true) LaunchDestination.Home else LaunchDestination.Onboarding(user.name)
                }
            }
        }
    }
