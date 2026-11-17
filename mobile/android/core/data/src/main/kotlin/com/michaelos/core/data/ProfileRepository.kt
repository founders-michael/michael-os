package com.michaelos.core.data

import com.michaelos.core.model.AppError
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.Profile
import com.michaelos.core.model.ProfileResponse
import com.michaelos.core.model.ProfileUpdate
import com.michaelos.core.network.ApiClient
import com.michaelos.core.network.ApiRequest
import com.michaelos.core.network.ApiResponse
import com.michaelos.core.network.EmptyBody
import javax.inject.Inject

interface ProfileRepository {
    /** Null until onboarding saves its first step. */
    suspend fun profile(): Outcome<Profile?>

    suspend fun save(update: ProfileUpdate): Outcome<Profile>

    /** Needs a saved `onboardingStep` of 5; the server refuses earlier calls with 400. */
    suspend fun complete(): Outcome<Profile>
}

class RemoteProfileRepository
    @Inject
    constructor(
        private val client: ApiClient,
    ) : ProfileRepository {
        override suspend fun profile(): Outcome<Profile?> = client.send(ApiRequest.get<ProfileResponse>("/api/profile")).map { it.profile }

        override suspend fun save(update: ProfileUpdate): Outcome<Profile> =
            client.send(ApiRequest.patch<ProfileResponse, ProfileUpdate>("/api/profile", update)).required()

        override suspend fun complete(): Outcome<Profile> =
            client.send(ApiRequest.post<ProfileResponse, EmptyBody>("/api/profile/complete", EmptyBody)).required()

        private fun <T, R> Outcome<ApiResponse<T>>.map(transform: (T) -> R): Outcome<R> =
            when (this) {
                is Outcome.Success -> Outcome.Success(transform(value.value))
                is Outcome.Failure -> this
            }

        private fun Outcome<ApiResponse<ProfileResponse>>.required(): Outcome<Profile> =
            when (val profile = map { it.profile }) {
                is Outcome.Failure -> profile
                is Outcome.Success -> profile.value?.let { Outcome.Success(it) } ?: Outcome.Failure(AppError.Decoding)
            }
    }
