from datetime import UTC, datetime

from app.models.requests import PlannerConstraintInput
from app.services.time_utils import expand_availability


def test_dst_spring_forward_uses_real_elapsed_duration(payload):
    payload["user"]["timeZone"] = "America/New_York"
    payload["horizon"] = {"from": "2026-03-08T00:00:00Z", "to": "2026-03-09T00:00:00Z"}
    payload["recurringAvailability"] = [{"id": "window", "isoWeekday": 7, "startLocalTime": "09:00", "endLocalTime": "17:00", "timeZone": "America/New_York"}]
    request = PlannerConstraintInput.model_validate(payload)
    intervals, _ = expand_availability(request)
    assert intervals[0].duration == 8 * 60
    assert datetime.fromtimestamp(intervals[0].start * 60, UTC).hour == 13


def test_nonexistent_local_availability_boundary_is_skipped_with_warning(payload):
    payload["user"]["timeZone"] = "America/New_York"
    payload["horizon"] = {"from": "2026-03-08T00:00:00Z", "to": "2026-03-09T00:00:00Z"}
    payload["recurringAvailability"] = [{"id": "window", "isoWeekday": 7, "startLocalTime": "02:30", "endLocalTime": "04:00", "timeZone": "America/New_York"}]
    request = PlannerConstraintInput.model_validate(payload)
    intervals, warnings = expand_availability(request)
    assert intervals == []
    assert warnings[0][0] == "DST_NONEXISTENT_AVAILABILITY_SKIPPED"


def test_ambiguous_fall_back_boundary_chooses_earlier_instant(payload):
    payload["user"]["timeZone"] = "America/New_York"
    payload["horizon"] = {"from": "2026-11-01T00:00:00Z", "to": "2026-11-02T00:00:00Z"}
    payload["recurringAvailability"] = [{"id": "window", "isoWeekday": 7, "startLocalTime": "01:00", "endLocalTime": "02:00", "timeZone": "America/New_York"}]
    request = PlannerConstraintInput.model_validate(payload)
    intervals, warnings = expand_availability(request)
    assert intervals[0].start == int(datetime(2026, 11, 1, 5, tzinfo=UTC).timestamp() // 60)
    assert intervals[0].duration == 120
    assert warnings[0][0] == "DST_AMBIGUOUS_TIME_EARLIER_INSTANT"


def test_ist_and_multiday_horizon(payload):
    payload["user"]["timeZone"] = "Asia/Kolkata"
    payload["horizon"] = {"from": "2026-06-01T00:00:00Z", "to": "2026-06-03T00:00:00Z"}
    payload["recurringAvailability"] = [{"id": "window", "isoWeekday": 1, "startLocalTime": "09:00", "endLocalTime": "10:00", "timeZone": "Asia/Kolkata"}]
    request = PlannerConstraintInput.model_validate(payload)
    intervals, _ = expand_availability(request)
    assert len(intervals) == 1
    assert datetime.fromtimestamp(intervals[0].start * 60, UTC).isoformat() == "2026-06-01T03:30:00+00:00"


def test_midnight_crossing_horizon_uses_local_weekday(payload):
    payload["user"]["timeZone"] = "Asia/Kolkata"
    payload["horizon"] = {"from": "2026-06-01T18:00:00Z", "to": "2026-06-02T18:00:00Z"}
    payload["recurringAvailability"] = [
        {"id": "monday", "isoWeekday": 1, "startLocalTime": "23:00", "endLocalTime": "23:59", "timeZone": "Asia/Kolkata"},
        {"id": "tuesday", "isoWeekday": 2, "startLocalTime": "00:00", "endLocalTime": "01:00", "timeZone": "Asia/Kolkata"},
    ]
    request = PlannerConstraintInput.model_validate(payload)
    intervals, _ = expand_availability(request)
    assert len(intervals) == 2
    assert datetime.fromtimestamp(intervals[0].start * 60, UTC).isoformat() == "2026-06-01T18:00:00+00:00"
    assert datetime.fromtimestamp(intervals[1].start * 60, UTC).isoformat() == "2026-06-01T18:30:00+00:00"


def test_invalid_timezone_is_rejected(payload):
    payload["user"]["timeZone"] = "Not/A_Zone"
    try:
        PlannerConstraintInput.model_validate(payload)
        assert False, "invalid timezone accepted"
    except ValueError:
        pass
