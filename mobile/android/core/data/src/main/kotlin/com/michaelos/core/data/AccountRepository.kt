package com.michaelos.core.data

import com.michaelos.core.model.Account
import com.michaelos.core.model.AccountResponse
import com.michaelos.core.model.AccountUpdate
import com.michaelos.core.model.DeleteAccountRequest
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.PersonalContext
import com.michaelos.core.model.PersonalContextResponse
import com.michaelos.core.model.PersonalContextSave
import com.michaelos.core.model.SuccessResponse
import com.michaelos.core.network.ApiClient
import com.michaelos.core.network.ApiRequest
import javax.inject.Inject

interface AccountRepository {
    suspend fun account(): Outcome<Account>

    suspend fun save(update: AccountUpdate): Outcome<Account>

    suspend fun context(): Outcome<PersonalContext>

    /** Refused with `Conflict` (`CONTEXT_CHANGED`) when the context was saved elsewhere since `expectedUpdatedAt`. */
    suspend fun save(context: PersonalContextSave): Outcome<PersonalContext>

    /** Back to the sign-in provider's picture, or initials. */
    suspend fun removePicture(): Outcome<Account>

    /** Removes the account and everything in it. The session on this device is cleared by signing out after. */
    suspend fun deleteAccount(password: String): Outcome<Unit>
}

class RemoteAccountRepository
    @Inject
    constructor(
        private val client: ApiClient,
    ) : AccountRepository {
        override suspend fun account(): Outcome<Account> =
            client
                .send(
                    ApiRequest.get<AccountResponse>("/api/account"),
                ).value()
                .map { it.account }

        override suspend fun save(update: AccountUpdate): Outcome<Account> =
            client.send(ApiRequest.patch<AccountResponse, AccountUpdate>("/api/account", update)).value().map { it.account }

        override suspend fun context(): Outcome<PersonalContext> =
            client.send(ApiRequest.get<PersonalContextResponse>("/api/account/context")).value().map { it.context }

        override suspend fun save(context: PersonalContextSave): Outcome<PersonalContext> =
            client
                .send(ApiRequest.put<PersonalContextResponse, PersonalContextSave>("/api/account/context", context))
                .value()
                .map { it.context }

        override suspend fun removePicture(): Outcome<Account> =
            client.send(ApiRequest.delete<AccountResponse>("/api/account/image")).value().map { it.account }

        override suspend fun deleteAccount(password: String): Outcome<Unit> =
            client
                .send(ApiRequest.post<SuccessResponse, DeleteAccountRequest>("/api/auth/delete-user", DeleteAccountRequest(password)))
                .value()
                .map { }
    }
