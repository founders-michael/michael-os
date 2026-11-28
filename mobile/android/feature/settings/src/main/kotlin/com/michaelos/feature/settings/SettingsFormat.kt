package com.michaelos.feature.settings

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.michaelos.core.data.Appearance
import com.michaelos.core.model.AppError

@Composable
internal fun appearanceText(appearance: Appearance): String =
    stringResource(
        when (appearance) {
            Appearance.System -> R.string.settings_appearance_system
            Appearance.Dark -> R.string.settings_appearance_dark
            Appearance.Light -> R.string.settings_appearance_light
        },
    )

@Composable
internal fun providerText(provider: String): String =
    when (provider) {
        "credential" -> stringResource(R.string.settings_provider_email)
        "google" -> stringResource(R.string.settings_provider_google)
        "apple" -> stringResource(R.string.settings_provider_apple)
        "github" -> stringResource(R.string.settings_provider_github)
        else -> provider
    }

@Composable
internal fun AppError.deleteMessage(): String =
    when {
        this is AppError.Conflict && server.code == "ORGANIZATION_MEMBERSHIP_BLOCKS_DELETION" -> {
            stringResource(R.string.settings_delete_organization)
        }

        this is AppError.Validation && server.code == "INVALID_PASSWORD" -> {
            stringResource(R.string.settings_delete_wrong_password)
        }

        else -> {
            message()
        }
    }

@Composable
internal fun AppError.message(): String =
    when (this) {
        AppError.Offline -> stringResource(R.string.settings_error_offline)
        AppError.Timeout -> stringResource(R.string.settings_error_timeout)
        AppError.Decoding -> null
        is AppError.Forbidden -> server.text
        is AppError.NotFound -> server.text
        is AppError.Conflict -> server.text
        is AppError.Server -> server.text
        is AppError.Validation -> server.text
        is AppError.Unauthorized -> server.text
        is AppError.RateLimited -> server.text
    } ?: stringResource(R.string.settings_error_generic)
