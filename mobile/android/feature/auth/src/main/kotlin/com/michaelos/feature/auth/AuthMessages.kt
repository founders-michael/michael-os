package com.michaelos.feature.auth

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.michaelos.core.model.AppError

/**
 * The sentence the auth screens show. A wrong password and an unknown email get the same words, so the screen
 * never says which one was wrong.
 */
@Composable
internal fun AppError.authMessage(): String =
    when (this) {
        AppError.Offline -> stringResource(R.string.auth_error_offline)
        AppError.Timeout -> stringResource(R.string.auth_error_timeout)
        is AppError.Unauthorized -> stringResource(R.string.auth_error_credentials)
        is AppError.RateLimited -> stringResource(R.string.auth_error_rate_limited)
        AppError.Decoding -> stringResource(R.string.auth_error_generic)
        is AppError.Forbidden -> server.text
        is AppError.NotFound -> server.text
        is AppError.Conflict -> server.text
        is AppError.Server -> server.text
        is AppError.Validation -> server.text
    } ?: stringResource(R.string.auth_error_generic)
