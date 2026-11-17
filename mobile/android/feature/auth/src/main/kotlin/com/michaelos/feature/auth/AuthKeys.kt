package com.michaelos.feature.auth

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

/** The auth screens. The app owns the back stack and maps each key to its screen. */
@Serializable
data object WelcomeKey : NavKey

@Serializable
data object SignInKey : NavKey

@Serializable
data object RegisterKey : NavKey

@Serializable
data class CheckEmailKey(
    val email: String,
) : NavKey
