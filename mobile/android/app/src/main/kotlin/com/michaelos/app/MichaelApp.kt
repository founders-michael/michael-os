package com.michaelos.app

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.navigation3.rememberViewModelStoreNavEntryDecorator
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import androidx.navigation3.ui.NavDisplay
import com.michaelos.core.designsystem.component.MichaelBackground
import com.michaelos.core.designsystem.theme.MichaelTheme
import com.michaelos.feature.auth.CheckEmailKey
import com.michaelos.feature.auth.CheckEmailScreen
import com.michaelos.feature.auth.RegisterKey
import com.michaelos.feature.auth.RegisterScreen
import com.michaelos.feature.auth.SignInKey
import com.michaelos.feature.auth.SignInScreen
import com.michaelos.feature.auth.WelcomeKey
import com.michaelos.feature.auth.WelcomeScreen
import com.michaelos.feature.onboarding.OnboardingScreen
import java.time.ZoneId

@Composable
fun MichaelApp(launch: LaunchViewModel = hiltViewModel()) {
    val destination by launch.destination.collectAsStateWithLifecycle()
    when (val current = destination) {
        LaunchDestination.Checking -> {
            MichaelBackground(Modifier.fillMaxSize()) {
                CircularProgressIndicator(color = MichaelTheme.colors.accent, modifier = Modifier.align(Alignment.Center))
            }
        }

        LaunchDestination.SignedOut -> {
            AuthFlow()
        }

        is LaunchDestination.Onboarding -> {
            OnboardingScreen(
                suggestedName = current.suggestedName,
                deviceTimeZone = ZoneId.systemDefault().id,
                onFinished = launch::onboardingFinished,
            )
        }

        LaunchDestination.Home -> {
            AppShell(sessionScope = launch.sessionScope, onSignOut = launch::signOut)
        }
    }
}

/** Welcome and the screens behind it. The back stack starts afresh each time the user is signed out. */
@Composable
private fun AuthFlow() {
    val backStack = rememberNavBackStack(WelcomeKey)
    NavDisplay(
        backStack = backStack,
        onBack = { backStack.removeLastOrNull() },
        entryDecorators = listOf(rememberSaveableStateHolderNavEntryDecorator(), rememberViewModelStoreNavEntryDecorator()),
        entryProvider =
            entryProvider {
                entry<WelcomeKey> {
                    WelcomeScreen(
                        termsUrl = BuildConfig.LEGAL_TERMS_URL,
                        privacyUrl = BuildConfig.LEGAL_PRIVACY_URL,
                        onSignIn = { backStack.add(SignInKey) },
                        onRegister = { backStack.add(RegisterKey) },
                    )
                }
                entry<SignInKey> {
                    SignInScreen(
                        onBack = { backStack.removeLastOrNull() },
                        onRegister = { backStack.add(RegisterKey) },
                        onNeedsVerification = { backStack.add(CheckEmailKey(it)) },
                    )
                }
                entry<RegisterKey> {
                    RegisterScreen(
                        termsUrl = BuildConfig.LEGAL_TERMS_URL,
                        privacyUrl = BuildConfig.LEGAL_PRIVACY_URL,
                        onBack = { backStack.removeLastOrNull() },
                        onRegistered = { backStack.add(CheckEmailKey(it)) },
                    )
                }
                entry<CheckEmailKey> { key ->
                    CheckEmailScreen(
                        email = key.email,
                        onBack = { backStack.removeLastOrNull() },
                        onSignIn = { backStack.replaceWith(WelcomeKey, SignInKey) },
                    )
                }
            },
    )
}

private fun NavBackStack<NavKey>.replaceWith(vararg keys: NavKey) {
    clear()
    addAll(keys)
}
