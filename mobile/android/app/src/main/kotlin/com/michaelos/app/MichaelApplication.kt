package com.michaelos.app

import android.app.Application
import com.michaelos.core.network.ApiBaseUrl
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.HiltAndroidApp
import dagger.hilt.components.SingletonComponent
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl

@HiltAndroidApp
class MichaelApplication : Application()

@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides
    @ApiBaseUrl
    fun apiBaseUrl(): HttpUrl = BuildConfig.API_BASE_URL.toHttpUrl()
}
