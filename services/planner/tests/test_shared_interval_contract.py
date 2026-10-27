import json
from datetime import UTC, datetime
from pathlib import Path

from pydantic import ValidationError

from app.models.requests import PlannerConstraintInput
from app.services.time_utils import expand_availability


FIXTURES = json.loads((Path(__file__).parents[3] / "shared" / "calendar-interval-fixtures.json").read_text())


def _iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def test_shared_calendar_interval_contract() -> None:
    for fixture in FIXTURES:
        request_data = {
            "user": {"timeZone": fixture.get("userTimeZone", "UTC")},
            "horizon": fixture["horizon"],
            "scheduledActivities": [],
            "flexibleTasks": [],
            "recurringAvailability": [
                {
                    "id": window["id"],
                    "isoWeekday": window["weekday"],
                    "startLocalTime": window["startTime"],
                    "endLocalTime": window["endTime"],
                    "timeZone": window["timeZone"],
                }
                for window in fixture["windows"]
            ],
            "unavailableIntervals": [],
            "constraints": {"preserveFixedEvents": True, "noOverlaps": True, "dueDatesAreDeadlinesOnly": True},
        }
        if fixture.get("valid") is False:
            try:
                PlannerConstraintInput.model_validate(request_data)
            except ValidationError:
                continue
            raise AssertionError(f"{fixture['name']}: overlapping availability should be rejected")
        request = PlannerConstraintInput.model_validate(request_data)
        intervals, _ = expand_availability(request)
        session_start = datetime.fromisoformat(fixture["session"]["start"].replace("Z", "+00:00"))
        session_end = datetime.fromisoformat(fixture["session"]["end"].replace("Z", "+00:00"))
        fits = any(interval.start <= int(session_start.timestamp() // 60) and int(session_end.timestamp() // 60) <= interval.end for interval in intervals)
        assert fits is fixture["fits"], fixture["name"]
        if "expectedIntervals" in fixture:
            actual = [{"start": _iso(datetime.fromtimestamp(interval.start * 60, UTC)), "end": _iso(datetime.fromtimestamp(interval.end * 60, UTC))} for interval in intervals]
            assert actual == fixture["expectedIntervals"], fixture["name"]

