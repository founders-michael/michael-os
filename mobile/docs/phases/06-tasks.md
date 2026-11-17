# Phase 6: Tasks

## Goal
Full task management: list, filter, search, create, edit, complete, delete.

## Screens
Task list, task detail, task editor sheet. Mocks: list in content, empty, loading and failure; detail; editor.

## Endpoints
"Tasks" in `api-contract.md`.

## Build
- List with the view filter, sort and search, paginated 30 at a time with load-more on scroll.
- Search is debounced and cancels the previous request.
- Row check toggles `COMPLETED` optimistically. Status can also be set to in progress from detail.
- Editor for create and edit: title, notes, priority, due date, estimate. Validation mirrors the server limits.
- Natural-language capture: the text goes to Michael and comes back as a draft shown in the editor before anything is saved.
- Delete with a confirmation that says history and planned sessions are removed too.
- Changes here invalidate My Day's data.

## Edge cases
- Empty list per filter has its own wording ("Nothing overdue")
- Filter and status combinations the server rejects are not offered
- Page 2 fails while page 1 is shown
- Task deleted elsewhere: detail shows not found and returns to the list
- Edit conflict: last write wins on the server; after saving, show what the server returned
- 160-character title and 5,000-character notes, pasted text beyond the limit
- Estimate outside 5 to 1,440 minutes
- Due date in the past is allowed and shows as overdue
- Editor dismissed with unsaved changes asks before discarding
- Rapid toggling of the same task ends in the state the user last chose

## Done when
- Every action matches the web app for the same account.
- Tests cover pagination, search cancellation, each validation rule and optimistic toggle with rollback.
