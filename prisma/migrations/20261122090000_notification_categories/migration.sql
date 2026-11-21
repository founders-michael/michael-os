-- Per-category notification settings replace the two per-channel switches. Hand-written so existing choices
-- carry over: a user who had a channel off has every category of it off.
ALTER TABLE "NotificationPreference"
  ADD COLUMN "inAppTasks" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "inAppGoals" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "inAppHabits" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "emailTasks" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "emailGoals" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "emailHabits" BOOLEAN NOT NULL DEFAULT true;

UPDATE "NotificationPreference"
SET "inAppTasks" = "inApp", "inAppGoals" = "inApp", "inAppHabits" = "inApp",
    "emailTasks" = "email", "emailGoals" = "email", "emailHabits" = "email";

ALTER TABLE "NotificationPreference" DROP COLUMN "inApp", DROP COLUMN "email";
