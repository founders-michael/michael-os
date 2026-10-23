from app.services.feasibility import check_feasibility
from app.models.requests import PlannerConstraintInput


def test_feasibility_is_solver_confirmed(client, payload):
    response = client.post("/v1/plans/feasibility", json=payload, headers={"Authorization": "Bearer test-token-with-more-than-32-characters"})
    assert response.status_code == 200
    result = response.json()
    assert result["isFeasible"] is True
    assert result["solverStatus"] == "OPTIMAL"
    assert result["requiredTaskMinutes"] == 60


def test_unconfigured_availability_is_not_assumed_free(payload):
    payload["recurringAvailability"] = []
    request = PlannerConstraintInput.model_validate(payload)
    result = check_feasibility(request)
    assert result.is_feasible is False
    assert result.available_minutes == 0
    assert result.warnings[0].code == "AVAILABILITY_UNCONFIGURED"


def test_tasks_exceeding_total_capacity_are_infeasible(payload):
    payload["flexibleTasks"][0]["durationMinutes"] = 9 * 60
    request = PlannerConstraintInput.model_validate(payload)
    result = check_feasibility(request)
    assert result.is_feasible is False
    assert result.solver_status == "INFEASIBLE"


def test_partially_occupied_day_calculates_free_intervals(payload):
    payload["scheduledActivities"] = [{"id": "meeting", "eventType": "COMMITMENT", "schedulingMode": "FIXED", "taskId": None, "title": "Meeting", "startAt": "2026-06-01T12:00:00Z", "endAt": "2026-06-01T14:00:00Z", "timeZone": "UTC"}]
    request = PlannerConstraintInput.model_validate(payload)
    result = check_feasibility(request)
    assert result.available_minutes == 480
    assert result.occupied_minutes == 120
    assert [(item.start_at.hour, item.end_at.hour) for item in result.free_intervals] == [(9, 12), (14, 17)]


def test_unavailable_interval_blocks_time_and_fully_occupied_availability_has_no_free_time(payload):
    payload["unavailableIntervals"] = [{"id": "time-off", "startAt": "2026-06-01T09:00:00Z", "endAt": "2026-06-01T17:00:00Z", "timeZone": "UTC"}]
    request = PlannerConstraintInput.model_validate(payload)
    result = check_feasibility(request)
    assert result.is_feasible is False
    assert result.available_minutes == 480
    assert result.occupied_minutes == 480
    assert result.free_intervals == []
