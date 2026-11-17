# Phase 11: notifications

Scope and the local-versus-push decision are in `store-requirements.md`. This file assumes local notifications; if the team chooses push, S8 comes first and this file is rewritten.

## Goal
Opt-in reminders scheduled on the device from the user's own plan.

## Build
- Primer screen with our explanation, shown after onboarding or after the first planned session, then the system prompt. Never at first launch.
- Schedulers for: daily plan, session starting, habit reminder, evening review. Each reschedules whenever its source data is refreshed.
- Settings: one switch per type, and a row that opens system settings when permission is denied.
- Tapping a notification opens the matching screen.
- Quiet hours between bedtime and wake time from the profile.

## Edge cases
- Permission denied, then granted later in system settings
- Plan changed on web: stale reminders are replaced on the next refresh, and a reminder for a deleted session never fires after a refresh
- Habit already checked in before its reminder time
- Time zone change and daylight-saving shift
- Sign out cancels everything scheduled
- iOS limit on pending local notifications (64): schedule the nearest ones only
- Android exact-alarm restrictions and battery optimisation: use inexact scheduling unless a reminder truly needs the minute
- Notification text contains no notes or personal context

## Done when
- Each type fires at the right local time on both platforms, opens the right screen, and stops when switched off.
- The app is fully usable with notifications denied.
