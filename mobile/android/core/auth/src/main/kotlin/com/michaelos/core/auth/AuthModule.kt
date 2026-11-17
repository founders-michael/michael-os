package com.michaelos.core.auth

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.preferencesDataStoreFile
import com.michaelos.core.network.ApiClient
import com.michaelos.core.network.SessionCredentials
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AuthModule {
    @Provides
    @Singleton
    fun tokenStore(
        @ApplicationContext context: Context,
    ): TokenStore =
        DataStoreTokenStore(
            PreferenceDataStoreFactory.create { context.preferencesDataStoreFile("session") },
            KeystoreTokenCipher(),
        )

    // The session outlives every screen, so its writes to the store run in a scope tied to the app.
    @Provides
    @Singleton
    fun session(store: TokenStore): Session = Session(store, CoroutineScope(SupervisorJob() + Dispatchers.IO))

    @Provides
    fun sessionCredentials(session: Session): SessionCredentials = session

    @Provides
    fun authenticator(
        client: ApiClient,
        session: Session,
    ): Authenticator = Authenticator(client, session)
}
