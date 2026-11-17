package com.michaelos.core.auth

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.util.Base64

class DataStoreTokenStoreTest {
    @get:Rule
    val folder = TemporaryFolder()

    // Reverses the bytes: enough to prove the store writes only what the cipher returns.
    private class ReversingCipher : TokenCipher {
        override fun encrypt(plain: ByteArray) = plain.reversedArray()

        override fun decrypt(sealed: ByteArray) = sealed.reversedArray()
    }

    @Test
    fun savesReadsAndDeletesOnlyTheSealedValue() =
        runTest {
            val file = folder.root.resolve("session.preferences_pb")
            val store =
                DataStoreTokenStore(
                    PreferenceDataStoreFactory.create(scope = backgroundScope) { file },
                    ReversingCipher(),
                    encode = { Base64.getEncoder().encodeToString(it) },
                    decode = { Base64.getDecoder().decode(it) },
                )
            assertNull(store.read())
            store.save("abc.def-token")
            assertEquals("abc.def-token", store.read())
            assertFalse(file.readText(Charsets.ISO_8859_1).contains("abc.def-token"))
            store.delete()
            assertNull(store.read())
        }
}
