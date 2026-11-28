package com.michaelos.core.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStoreFile
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/** The user's choice of theme. */
enum class Appearance { System, Dark, Light }

/** The theme choice, kept on the device only. Read at the app root and written in Settings. */
@Singleton
class AppearanceStore
    @Inject
    constructor(
        @ApplicationContext context: Context,
    ) {
        private val store: DataStore<Preferences> = PreferenceDataStoreFactory.create { context.preferencesDataStoreFile("appearance") }
        private val key = stringPreferencesKey("appearance")

        val appearance: Flow<Appearance> =
            store.data.map { preferences -> Appearance.entries.firstOrNull { it.name == preferences[key] } ?: Appearance.System }

        suspend fun set(appearance: Appearance) {
            store.edit { it[key] = appearance.name }
        }
    }
