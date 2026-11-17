package com.michaelos.core.testing

import com.michaelos.core.auth.TokenStore
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

class FakeTokenStore(
    token: String? = null,
) : TokenStore {
    private val stored = AtomicReference(token)
    private val deleteCount = AtomicInteger()

    val deletes: Int get() = deleteCount.get()

    override suspend fun read(): String? = stored.get()

    override suspend fun save(token: String) = stored.set(token)

    override suspend fun delete() {
        stored.set(null)
        deleteCount.incrementAndGet()
    }
}
