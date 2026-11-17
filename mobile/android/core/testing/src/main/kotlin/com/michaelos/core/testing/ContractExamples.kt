package com.michaelos.core.testing

import java.io.File

/**
 * `mobile/contract/`: real server responses in `examples/` and the shared error table. Both apps' tests read the
 * same files. Test tasks pass the folder as the `contract.path` system property.
 */
object ContractExamples {
    private val directory get() = File(checkNotNull(System.getProperty("contract.path")) { "contract.path is not set" })

    fun example(name: String): String = File(directory, "examples/$name").readText()

    fun exampleBytes(name: String): ByteArray = File(directory, "examples/$name").readBytes()

    fun file(name: String): String = File(directory, name).readText()
}
