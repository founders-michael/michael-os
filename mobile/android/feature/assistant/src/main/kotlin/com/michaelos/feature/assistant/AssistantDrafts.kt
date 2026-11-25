package com.michaelos.feature.assistant

import androidx.lifecycle.viewModelScope
import com.michaelos.core.model.AppError
import com.michaelos.core.model.DraftKind
import com.michaelos.core.model.DraftOutcome
import com.michaelos.core.model.DraftValue
import com.michaelos.core.model.Outcome
import kotlinx.coroutines.launch

/** Where a record saved from a draft now lives. */
enum class Destination { Tasks, Goals, Habits, Calendar, Settings }

fun destinationOf(kind: DraftKind): Destination? =
    when (kind) {
        DraftKind.Task -> Destination.Tasks
        DraftKind.Goal -> Destination.Goals
        DraftKind.Habit -> Destination.Habits
        DraftKind.CalendarEvent -> Destination.Calendar
        DraftKind.Memory -> Destination.Settings
        DraftKind.Unknown -> null
    }

internal fun AssistantViewModel.draft(id: String): DraftCard? =
    content
        ?.entries
        ?.asSequence()
        ?.mapNotNull { (it as? ChatEntry.Michael)?.reply?.drafts?.firstOrNull { card -> card.id == id } }
        ?.firstOrNull()

private fun AssistantViewModel.updateDraft(
    id: String,
    change: (DraftCard) -> DraftCard,
) {
    update { content ->
        content.copy(
            entries =
                content.entries.map { entry ->
                    if (entry is ChatEntry.Michael && entry.reply.drafts.any { it.id == id }) {
                        entry.copy(reply = entry.reply.copy(drafts = entry.reply.drafts.map { if (it.id == id) change(it) else it }))
                    } else {
                        entry
                    }
                },
        )
    }
}

fun AssistantViewModel.edit(
    id: String,
    field: String,
    value: DraftValue?,
) {
    updateDraft(id) { card ->
        if (card.status != DraftCard.Status.Editing) {
            card
        } else {
            card.copy(form = card.form.with(field, value), fieldErrors = card.fieldErrors - field, error = null)
        }
    }
}

/**
 * Posts the edited values to the kind's own endpoint as the user. The card says saved only once the create call has
 * returned; Michael cannot save anything himself.
 */
fun AssistantViewModel.save(id: String) {
    val card = draft(id) ?: return
    if (card.status != DraftCard.Status.Editing) return
    val submission = card.form.submission
    if (submission == null) {
        updateDraft(id) { it.copy(error = Reason.Local(R.string.draft_error_incomplete)) }
        return
    }
    updateDraft(id) { it.copy(status = DraftCard.Status.Saving, error = null, fieldErrors = emptyMap()) }
    // The view model's scope, so leaving the screen does not cancel a save the user started.
    viewModelScope.launch {
        when (val outcome = post(submission)) {
            is Outcome.Success -> {
                updateDraft(id) { it.copy(status = DraftCard.Status.Saved) }
                report(DraftOutcome.Kind.Saved, card.form.kind)
            }

            is Outcome.Failure -> {
                updateDraft(id) {
                    val fields = (outcome.error as? AppError.Validation)?.fields.orEmpty()
                    it.copy(
                        status = DraftCard.Status.Editing,
                        error = saveRefusal(outcome.error),
                        fieldErrors =
                            fields
                                .mapNotNull { (name, reasons) -> reasons.firstOrNull()?.let { DraftForm.fieldFor(name) to it } }
                                .toMap(),
                    )
                }
            }
        }
    }
}

fun AssistantViewModel.discard(id: String) {
    val card = draft(id) ?: return
    if (card.status != DraftCard.Status.Editing) return
    updateDraft(id) { it.copy(status = DraftCard.Status.Discarded) }
    report(DraftOutcome.Kind.Discarded, card.form.kind)
}

private suspend fun AssistantViewModel.post(submission: DraftSubmission): Outcome<Unit> {
    val outcome =
        when (submission) {
            is DraftSubmission.Task -> repositories.tasks.create(submission.body)
            is DraftSubmission.Goal -> repositories.goals.create(submission.body)
            is DraftSubmission.Habit -> repositories.habits.create(submission.body)
            is DraftSubmission.CalendarEvent -> repositories.calendar.create(submission.body)
            is DraftSubmission.Memory -> repositories.memories.create(submission.body)
        }
    return when (outcome) {
        is Outcome.Success -> Outcome.Success(Unit)
        is Outcome.Failure -> outcome
    }
}

/**
 * What the user did with a draft feeds Michael's learning. A lost report never touches the draft, so its outcome is
 * dropped on purpose, as the web chat does.
 */
private fun AssistantViewModel.report(
    kind: DraftOutcome.Kind,
    subject: DraftKind,
) {
    if (subject == DraftKind.Unknown) return
    viewModelScope.launch { repositories.assistant.record(DraftOutcome(kind, subject)) }
}

private fun saveRefusal(error: AppError): Reason =
    when (error) {
        AppError.Offline -> Reason.Local(R.string.draft_error_offline)
        AppError.Timeout -> Reason.Local(R.string.draft_error_timeout)
        is AppError.Conflict -> error.server.text?.let(Reason::Server) ?: Reason.Local(R.string.draft_error_generic)
        is AppError.Validation -> error.server.text?.let(Reason::Server) ?: Reason.Local(R.string.draft_error_generic)
        is AppError.Forbidden -> error.server.text?.let(Reason::Server) ?: Reason.Local(R.string.draft_error_generic)
        is AppError.NotFound -> error.server.text?.let(Reason::Server) ?: Reason.Local(R.string.draft_error_generic)
        is AppError.RateLimited -> error.server.text?.let(Reason::Server) ?: Reason.Local(R.string.draft_error_generic)
        is AppError.Unauthorized, is AppError.Server, AppError.Decoding -> Reason.Local(R.string.draft_error_generic)
    }
