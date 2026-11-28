package com.michaelos.feature.settings

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.michaelos.core.data.AccountRepository
import com.michaelos.core.data.Appearance
import com.michaelos.core.data.AppearanceStore
import com.michaelos.core.data.AuthRepository
import com.michaelos.core.data.CalendarRepository
import com.michaelos.core.data.ProfileRepository
import com.michaelos.core.data.TaskChanges
import com.michaelos.core.model.Account
import com.michaelos.core.model.AppError
import com.michaelos.core.model.Availability
import com.michaelos.core.model.AvailabilityWindow
import com.michaelos.core.model.AvatarSource
import com.michaelos.core.model.Outcome
import com.michaelos.core.model.PersonalContext
import com.michaelos.core.model.ServerMessage
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

sealed interface SettingsUiState {
    data object Loading : SettingsUiState

    data class Content(
        val account: Account,
        /** The uploaded picture's bytes, once read. */
        val picture: ByteArray? = null,
    ) : SettingsUiState

    data class Failed(
        val error: AppError,
    ) : SettingsUiState
}

/** The account the Settings screens show, and the theme choice. */
@HiltViewModel
class SettingsViewModel
    @Inject
    constructor(
        private val accounts: AccountRepository,
        private val appearanceStore: AppearanceStore,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow<SettingsUiState>(SettingsUiState.Loading)
        val uiState: StateFlow<SettingsUiState> = mutableState.asStateFlow()
        val appearance: StateFlow<Appearance> =
            appearanceStore.appearance.stateIn(
                viewModelScope,
                SharingStarted.Eagerly,
                Appearance.System,
            )

        fun load() {
            viewModelScope.launch {
                when (val outcome = accounts.account()) {
                    is Outcome.Success -> {
                        val previous = mutableState.value as? SettingsUiState.Content
                        val same = previous?.account?.identity?.avatarUrl == outcome.value.identity.avatarUrl
                        mutableState.value = SettingsUiState.Content(outcome.value, previous?.picture?.takeIf { same })
                        if (!same) mutableState.value = SettingsUiState.Content(outcome.value, accounts.pictureOf(outcome.value))
                    }

                    is Outcome.Failure -> {
                        if (mutableState.value !is SettingsUiState.Content) {
                            mutableState.value =
                                SettingsUiState.Failed(outcome.error)
                        }
                    }
                }
            }
        }

        fun setAppearance(appearance: Appearance) {
            viewModelScope.launch { appearanceStore.set(appearance) }
        }
    }

data class AccountEditorUiState(
    val account: Account? = null,
    val picture: ByteArray? = null,
    /** The chosen photo could not be made into a picture the server accepts. */
    val pictureRefused: Boolean = false,
    val form: AccountForm? = null,
    val saving: Boolean = false,
    val saved: Boolean = false,
    val failure: AppError? = null,
    val serverErrors: Map<String, String> = emptyMap(),
    val showsProblems: Boolean = false,
) {
    val hasChanges: Boolean get() = account != null && form != AccountForm.of(account)
}

/** Names and picture. It says saved only once the server has the account. */
@HiltViewModel
class AccountEditorViewModel
    @Inject
    constructor(
        private val accounts: AccountRepository,
        @param:ApplicationContext private val context: Context,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(AccountEditorUiState())
        val uiState: StateFlow<AccountEditorUiState> = mutableState.asStateFlow()

        init {
            viewModelScope.launch {
                when (val outcome = accounts.account()) {
                    is Outcome.Success -> {
                        mutableState.update { it.copy(account = outcome.value, form = AccountForm.of(outcome.value)) }
                        showPicture(outcome.value)
                    }

                    is Outcome.Failure -> {
                        mutableState.update { it.copy(failure = outcome.error) }
                    }
                }
            }
        }

        /** A photo from the library, re-encoded before it is sent; a picture change applies without the names' Save. */
        fun upload(photo: Uri) {
            if (uiState.value.saving) return
            mutableState.update { it.copy(saving = true, failure = null, pictureRefused = false) }
            viewModelScope.launch {
                val jpeg = withContext(Dispatchers.IO) { PictureEncoder.jpeg(context.contentResolver, photo) }
                val type = jpeg?.let(PictureRules::contentType)
                if (jpeg == null || type == null || !PictureRules.isAccepted(jpeg)) {
                    mutableState.update { it.copy(saving = false, pictureRefused = true) }
                    return@launch
                }
                changePicture { accounts.uploadPicture(jpeg, type) }
            }
        }

        private suspend fun changePicture(work: suspend () -> Outcome<Account>) {
            when (val outcome = work()) {
                is Outcome.Success -> {
                    mutableState.update { it.copy(saving = false, account = outcome.value, picture = null) }
                    showPicture(outcome.value)
                }

                is Outcome.Failure -> {
                    mutableState.update { it.copy(saving = false, failure = outcome.error) }
                }
            }
        }

        private suspend fun showPicture(account: Account) {
            val picture = accounts.pictureOf(account) ?: return
            mutableState.update { it.copy(picture = picture) }
        }

        fun edit(change: (AccountForm) -> AccountForm) =
            mutableState.update { state -> state.copy(form = state.form?.let(change), serverErrors = emptyMap(), failure = null) }

        fun save() {
            mutableState.update { it.copy(showsProblems = true) }
            val body = uiState.value.form?.save ?: return
            perform(markSaved = true) { accounts.save(body) }
        }

        fun removePicture() {
            if (uiState.value.saving) return
            mutableState.update { it.copy(saving = true, failure = null, pictureRefused = false) }
            viewModelScope.launch { changePicture { accounts.removePicture() } }
        }

        private fun perform(
            markSaved: Boolean,
            work: suspend () -> Outcome<Account>,
        ) {
            if (uiState.value.saving) return
            mutableState.update { it.copy(saving = true, failure = null) }
            viewModelScope.launch {
                when (val outcome = work()) {
                    is Outcome.Success -> {
                        mutableState.update {
                            it.copy(saving = false, saved = markSaved, account = outcome.value, form = AccountForm.of(outcome.value))
                        }
                    }

                    is Outcome.Failure -> {
                        val error = outcome.error
                        val fields =
                            (error as? AppError.Validation)
                                ?.fields
                                ?.mapNotNull { (key, value) ->
                                    value.firstOrNull()?.let { key to it }
                                }?.toMap()
                        mutableState.update {
                            if (fields.isNullOrEmpty()) {
                                it.copy(
                                    saving = false,
                                    failure = error,
                                )
                            } else {
                                it.copy(saving = false, serverErrors = fields)
                            }
                        }
                    }
                }
            }
        }
    }

data class ContextEditorUiState(
    val loading: Boolean = true,
    val loadFailure: AppError? = null,
    val draft: ContextDraft = ContextDraft("", null),
    val saved: String = "",
    val saving: Boolean = false,
    val failure: AppError? = null,
    /** The copy saved elsewhere, while the user chooses between it and theirs. */
    val conflict: PersonalContext? = null,
) {
    val hasChanges: Boolean get() = ContextDraft.normalized(draft.text) != saved
}

/** My Context. A save names the version it edited; when the server has a newer one, both are shown. */
@HiltViewModel
class ContextEditorViewModel
    @Inject
    constructor(
        private val accounts: AccountRepository,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(ContextEditorUiState())
        val uiState: StateFlow<ContextEditorUiState> = mutableState.asStateFlow()

        init {
            load()
        }

        fun load() {
            mutableState.update { it.copy(loadFailure = null) }
            viewModelScope.launch {
                when (val outcome = accounts.context()) {
                    is Outcome.Success -> show(outcome.value)
                    is Outcome.Failure -> mutableState.update { it.copy(loading = false, loadFailure = outcome.error) }
                }
            }
        }

        fun edit(text: String) = mutableState.update { it.copy(draft = it.draft.copy(text = text), failure = null) }

        fun save() {
            val state = uiState.value
            if (state.saving || state.draft.isTooLong) return
            write(state.draft.version)
        }

        /** Saves this device's text over the copy saved elsewhere. */
        fun keepMine() {
            val conflict = uiState.value.conflict ?: return
            write(conflict.updatedAt)
        }

        fun useSaved() {
            uiState.value.conflict?.let { show(it) }
        }

        private fun write(version: String?) {
            mutableState.update { it.copy(saving = true, failure = null) }
            viewModelScope.launch {
                when (val outcome = accounts.save(uiState.value.draft.save(version))) {
                    is Outcome.Success -> {
                        show(outcome.value)
                    }

                    is Outcome.Failure -> {
                        if (outcome.error is AppError.Conflict) {
                            val saved = accounts.context()
                            mutableState.update {
                                if (saved is Outcome.Success) {
                                    it.copy(saving = false, conflict = saved.value)
                                } else {
                                    it.copy(saving = false, failure = outcome.error)
                                }
                            }
                        } else {
                            mutableState.update { it.copy(saving = false, failure = outcome.error) }
                        }
                    }
                }
            }
        }

        private fun show(context: PersonalContext) =
            mutableState.update {
                it.copy(loading = false, draft = ContextDraft.of(context), saved = context.summary, saving = false, conflict = null)
            }
    }

data class DeleteAccountUiState(
    val password: String = "",
    val typed: String = "",
    val deleting: Boolean = false,
    val failure: AppError? = null,
) {
    val isReady: Boolean get() = DeleteConfirmation.isReady(password, typed) && !deleting
}

/** Deleting the account: password and the typed word, then sign out on this device. */
@HiltViewModel
class DeleteAccountViewModel
    @Inject
    constructor(
        private val accounts: AccountRepository,
        private val auth: AuthRepository,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(DeleteAccountUiState())
        val uiState: StateFlow<DeleteAccountUiState> = mutableState.asStateFlow()

        fun password(value: String) = mutableState.update { it.copy(password = value) }

        fun typed(value: String) = mutableState.update { it.copy(typed = value) }

        fun delete() {
            val state = uiState.value
            if (!state.isReady) return
            mutableState.update { it.copy(deleting = true, failure = null) }
            viewModelScope.launch {
                when (val outcome = accounts.deleteAccount(state.password)) {
                    is Outcome.Success -> auth.signOut()
                    is Outcome.Failure -> mutableState.update { it.copy(deleting = false, failure = outcome.error, password = "") }
                }
            }
        }
    }

/** The uploaded picture's bytes, or null when there is none or it could not be read (the initials show instead). */
internal suspend fun AccountRepository.pictureOf(account: Account): ByteArray? =
    if (account.identity.avatarSource == AvatarSource.Custom) (picture() as? Outcome.Success)?.value else null

private fun AppError.fieldMessages(): Map<String, String> =
    (this as? AppError.Validation)
        ?.fields
        ?.mapNotNull { (key, value) -> value.firstOrNull()?.let { key to it } }
        ?.toMap()
        .orEmpty()

data class RoutineEditorUiState(
    val loadFailure: AppError? = null,
    val saved: RoutineForm? = null,
    val form: RoutineForm? = null,
    val saving: Boolean = false,
    val done: Boolean = false,
    val failure: AppError? = null,
    val serverErrors: Map<String, String> = emptyMap(),
) {
    val hasChanges: Boolean get() = form != null && form != saved
}

/** The routine fields from onboarding, saved to the profile without the preferred name. */
@HiltViewModel
class RoutineEditorViewModel
    @Inject
    constructor(
        private val profiles: ProfileRepository,
        private val changes: TaskChanges,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(RoutineEditorUiState())
        val uiState: StateFlow<RoutineEditorUiState> = mutableState.asStateFlow()

        init {
            load()
        }

        fun load() {
            mutableState.update { it.copy(loadFailure = null) }
            viewModelScope.launch {
                when (val outcome = profiles.profile()) {
                    is Outcome.Success -> {
                        val profile = outcome.value
                        if (profile == null) {
                            mutableState.update { it.copy(loadFailure = AppError.Conflict(ServerMessage())) }
                        } else {
                            val form = RoutineForm.of(profile)
                            mutableState.update { it.copy(saved = form, form = form) }
                        }
                    }

                    is Outcome.Failure -> {
                        mutableState.update { it.copy(loadFailure = outcome.error) }
                    }
                }
            }
        }

        fun edit(change: (RoutineForm) -> RoutineForm) =
            mutableState.update { it.copy(form = it.form?.let(change), serverErrors = emptyMap(), failure = null) }

        /** Adds the typed priority and says why when it could not. */
        fun addPriority(text: String): RoutineForm.PriorityProblem? {
            val (form, problem) = uiState.value.form?.addPriority(text) ?: return null
            if (problem == null) edit { form }
            return problem
        }

        fun save() {
            val state = uiState.value
            val body = state.form?.save ?: return
            if (state.saving) return
            mutableState.update { it.copy(saving = true, failure = null) }
            viewModelScope.launch {
                when (val outcome = profiles.saveRoutine(body)) {
                    is Outcome.Success -> {
                        changes.changed()
                        mutableState.update { it.copy(saving = false, done = true) }
                    }

                    is Outcome.Failure -> {
                        val fields = outcome.error.fieldMessages()
                        mutableState.update {
                            if (fields.isEmpty()) {
                                it.copy(
                                    saving = false,
                                    failure = outcome.error,
                                )
                            } else {
                                it.copy(saving = false, serverErrors = fields)
                            }
                        }
                    }
                }
            }
        }
    }

data class AvailabilityEditorUiState(
    val loading: Boolean = true,
    val loadFailure: AppError? = null,
    val plan: AvailabilityPlan = AvailabilityPlan("", emptyList()),
    val savedWindows: List<AvailabilityWindow> = emptyList(),
    val saving: Boolean = false,
    val done: Boolean = false,
    val failure: AppError? = null,
) {
    val canSave: Boolean get() = plan.windows != savedWindows && plan.save != null && !saving
}

/** Weekly availability, saved as a whole set once every window passes the server's rules. */
@HiltViewModel
class AvailabilityEditorViewModel
    @Inject
    constructor(
        private val calendar: CalendarRepository,
        private val changes: TaskChanges,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(AvailabilityEditorUiState())
        val uiState: StateFlow<AvailabilityEditorUiState> = mutableState.asStateFlow()

        init {
            load()
        }

        fun load() {
            mutableState.update { it.copy(loadFailure = null) }
            viewModelScope.launch {
                when (val outcome = calendar.availability()) {
                    is Outcome.Success -> show(outcome.value)
                    is Outcome.Failure -> mutableState.update { it.copy(loading = false, loadFailure = outcome.error) }
                }
            }
        }

        fun edit(change: (AvailabilityPlan) -> AvailabilityPlan) = mutableState.update { it.copy(plan = change(it.plan), failure = null) }

        /** Adds a window on [weekday] and answers its id, for the sheet that edits it. */
        fun add(weekday: Int): String? {
            val (plan, id) = uiState.value.plan.add(weekday)
            edit { plan }
            return id
        }

        fun save() {
            val state = uiState.value
            val body = state.plan.save ?: return
            if (!state.canSave) return
            mutableState.update { it.copy(saving = true, failure = null) }
            viewModelScope.launch {
                when (val outcome = calendar.saveAvailability(body)) {
                    is Outcome.Success -> {
                        changes.changed()
                        show(outcome.value)
                        mutableState.update { it.copy(done = true) }
                    }

                    is Outcome.Failure -> {
                        mutableState.update { it.copy(saving = false, failure = outcome.error) }
                    }
                }
            }
        }

        private fun show(availability: Availability) {
            val plan = AvailabilityPlan.of(availability)
            mutableState.update { it.copy(loading = false, plan = plan, savedWindows = plan.windows, saving = false) }
        }
    }
