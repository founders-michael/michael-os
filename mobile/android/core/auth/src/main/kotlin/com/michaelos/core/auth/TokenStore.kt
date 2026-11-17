package com.michaelos.core.auth

import android.util.Base64
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.first

interface TokenStore {
    suspend fun read(): String?

    suspend fun save(token: String)

    suspend fun delete()
}

/** Seals and opens the token. The real one holds its key in the Android Keystore. */
interface TokenCipher {
    fun encrypt(plain: ByteArray): ByteArray

    /** Throws when the value was sealed by a key this device no longer has. */
    fun decrypt(sealed: ByteArray): ByteArray
}

/**
 * The session token in Preferences DataStore, sealed by [cipher] so the file alone is useless. The app allows no
 * backup or device transfer, so the sealed value never meets a device without its key.
 */
class DataStoreTokenStore(
    private val dataStore: DataStore<Preferences>,
    private val cipher: TokenCipher,
    private val encode: (ByteArray) -> String = { Base64.encodeToString(it, Base64.NO_WRAP) },
    private val decode: (String) -> ByteArray = { Base64.decode(it, Base64.NO_WRAP) },
) : TokenStore {
    private val key = stringPreferencesKey("session_token")

    override suspend fun read(): String? {
        val stored = dataStore.data.first()[key] ?: return null
        return cipher.decrypt(decode(stored)).toString(Charsets.UTF_8)
    }

    override suspend fun save(token: String) {
        val sealed = encode(cipher.encrypt(token.toByteArray(Charsets.UTF_8)))
        dataStore.edit { it[key] = sealed }
    }

    override suspend fun delete() {
        dataStore.edit { it.remove(key) }
    }
}
