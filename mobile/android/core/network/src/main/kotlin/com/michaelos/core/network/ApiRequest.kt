package com.michaelos.core.network

import com.michaelos.core.model.apiJson
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.Serializable
import kotlinx.serialization.serializer
import okhttp3.Headers

class ApiRequest<T>(
    val method: Method,
    val path: String,
    val query: List<Pair<String, String>>,
    val body: String?,
    val response: DeserializationStrategy<T>,
) {
    enum class Method { GET, POST, PATCH, DELETE }

    companion object {
        inline fun <reified T> get(
            path: String,
            query: List<Pair<String, String>> = emptyList(),
        ): ApiRequest<T> = ApiRequest(Method.GET, path, query, null, serializer<T>())

        inline fun <reified T, reified B> post(
            path: String,
            body: B,
        ): ApiRequest<T> = ApiRequest(Method.POST, path, emptyList(), apiJson.encodeToString(serializer<B>(), body), serializer<T>())

        inline fun <reified T, reified B> patch(
            path: String,
            body: B,
        ): ApiRequest<T> = ApiRequest(Method.PATCH, path, emptyList(), apiJson.encodeToString(serializer<B>(), body), serializer<T>())

        inline fun <reified T> delete(path: String): ApiRequest<T> = ApiRequest(Method.DELETE, path, emptyList(), null, serializer<T>())
    }
}

class ApiResponse<T>(
    val value: T,
    private val headers: Headers,
) {
    /** Header names are matched without regard to case, as HTTP requires. */
    fun header(name: String): String? = headers[name]
}

/** Request bodies that are an empty JSON object, which some Better Auth routes expect. */
@Serializable
data object EmptyBody

/** Where the client gets the bearer token and where it reports that the server refused one. */
interface SessionCredentials {
    fun currentToken(): String?

    /** The server answered 401 to a request sent with [token]. */
    fun reject(token: String)
}
