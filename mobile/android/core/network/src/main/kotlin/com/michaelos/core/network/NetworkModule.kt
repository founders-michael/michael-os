package com.michaelos.core.network

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit
import javax.inject.Qualifier
import javax.inject.Singleton

/** The API's base URL, provided by the app from its build configuration. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class ApiBaseUrl

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    private const val TIMEOUT_SECONDS = 30L

    @Provides
    @Singleton
    fun okHttpClient(): OkHttpClient =
        OkHttpClient
            .Builder()
            .cookieJar(CookieJar.NO_COOKIES)
            .callTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .build()

    @Provides
    @Singleton
    fun apiClient(
        @ApiBaseUrl baseUrl: HttpUrl,
        credentials: SessionCredentials,
        http: OkHttpClient,
    ): ApiClient = ApiClient(baseUrl, credentials, http)
}
