package com.michaelos.core.auth

import android.util.Log
import com.michaelos.core.network.SessionCredentials
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

enum class SessionState {
    /** DataStore reads are asynchronous, so the stored token is not known for the first moments after launch. */
    Restoring,
    SignedOut,
    SignedIn,
}

/**
 * Whether the user is signed in, and the token that proves it. The app root observes [state] and shows sign-in
 * when it becomes [SessionState.SignedOut]. [scope] lives as long as the app and persists changes to the store.
 */
class Session(
    private val store: TokenStore,
    private val scope: CoroutineScope,
    private val log: (String) -> Unit = { Log.w("session", it) },
) : SessionCredentials {
    private val lock = Any()
    private var token: String? = null
    private val mutableState = MutableStateFlow(SessionState.Restoring)
    val state: StateFlow<SessionState> = mutableState.asStateFlow()

    init {
        scope.launch {
            val stored = persisting("Reading") { store.read() }
            synchronized(lock) {
                if (mutableState.value == SessionState.Restoring) {
                    token = stored
                    mutableState.value = if (stored == null) SessionState.SignedOut else SessionState.SignedIn
                }
            }
        }
    }

    override fun currentToken(): String? = synchronized(lock) { token }

    suspend fun begin(token: String) {
        synchronized(lock) {
            this.token = token
            mutableState.value = SessionState.SignedIn
        }
        persisting("Saving") { store.save(token) }
    }

    suspend fun end() {
        clear()
        persisting("Deleting") { store.delete() }
    }

    /**
     * Every request that fails with 401 lands here. Only a rejection of the token currently held signs out, so
     * several requests failing together sign out once, and a late 401 for a token replaced by a new sign-in is
     * ignored.
     */
    override fun reject(token: String) {
        synchronized(lock) {
            if (this.token != token) return
            clear()
        }
        scope.launch { persisting("Deleting") { store.delete() } }
    }

    private fun clear() =
        synchronized(lock) {
            token = null
            mutableState.value = SessionState.SignedOut
        }

    // A store failure leaves the session working in memory until the app closes; it is logged as a bug.
    @Suppress("TooGenericExceptionCaught")
    private suspend fun <T> persisting(
        action: String,
        block: suspend () -> T,
    ): T? =
        try {
            block()
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            log("$action the session token failed: ${error::class.simpleName}")
            null
        }
}
