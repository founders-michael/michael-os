-- Add an explicit user-confirmed remaining-work estimate for safe replanning.
-- Existing records remain NULL; no historical estimate is inferred.
ALTER TABLE "Task"
  ADD COLUMN "remainingDurationMinutes" INTEGER;

-- Keep invalidated scheduled sessions as history while hiding them from active calendars.
ALTER TABLE "CalendarEvent"
  ADD COLUMN "cancelledAt" TIMESTAMPTZ(3);
