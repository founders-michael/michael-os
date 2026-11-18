-- Hand-written. The session CHECK in 20261119090000_outcome_events let a planned-session row through with no
-- hour or length: a CHECK passes when its expression is NULL, and "NULL BETWEEN 0 AND 23" is NULL. The rule
-- is the same; it now states "IS NOT NULL" so a missing value fails instead of passing.
ALTER TABLE "OutcomeEvent" DROP CONSTRAINT "OutcomeEvent_session_check";
ALTER TABLE "OutcomeEvent" ADD CONSTRAINT "OutcomeEvent_session_check" CHECK (
  CASE WHEN "kind" IN ('PLAN_SESSION_KEPT', 'PLAN_SESSION_DESELECTED')
    THEN "localHour" IS NOT NULL AND "durationMinutes" IS NOT NULL
      AND "localHour" BETWEEN 0 AND 23 AND "durationMinutes" BETWEEN 1 AND 1440
    ELSE "localHour" IS NULL AND "durationMinutes" IS NULL
  END
);
