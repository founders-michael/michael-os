from app.models.requests import PlannerConstraintInput
from app.services.scheduler import solve_plan
from app.services.time_utils import prepare_intervals, to_minute


def _generate(payload):
    request = PlannerConstraintInput.model_validate(payload)
    prepared = prepare_intervals(request)
    return request, solve_plan(request, prepared.placement_free), prepared


def test_one_and_multiple_tasks_are_scheduled_without_overlap(payload):
    payload["flexibleTasks"] = [
        {"id": "a", "title": "A", "durationMinutes": 60, "priority": "HIGH", "dueDate": None},
        {"id": "b", "title": "B", "durationMinutes": 60, "priority": "MEDIUM", "dueDate": None},
    ]
    request, result, prepared = _generate(payload)
    assert result.status == "OPTIMAL"
    assert len(result.segments) == 2
    assert result.segments[0].start_minute + result.segments[0].duration_minutes <= result.segments[1].start_minute
    for segment in result.segments:
        end = segment.start_minute + segment.duration_minutes
        assert any(window.start <= segment.start_minute and end <= window.end for window in prepared.free)
        assert segment.task_id in {task.id for task in request.flexible_tasks}


def test_high_priority_outweighs_multiple_lower_priority_tasks(payload):
    payload["flexibleTasks"] = [{"id": "urgent", "title": "Urgent", "durationMinutes": 240, "priority": "HIGH", "dueDate": None}]
    payload["flexibleTasks"].extend({"id": f"low-{number}", "title": "Low", "durationMinutes": 60, "priority": "LOW", "dueDate": None} for number in range(5))
    _, result, _ = _generate(payload)
    assert "urgent" in result.scheduled_task_ids


def test_nearer_deadline_wins_within_same_priority_tier(payload):
    payload["recurringAvailability"][0]["endLocalTime"] = "10:00"
    payload["flexibleTasks"] = [
        {"id": "later", "title": "Later", "durationMinutes": 60, "priority": "MEDIUM", "dueDate": "2026-06-10"},
        {"id": "due-today", "title": "Due today", "durationMinutes": 60, "priority": "MEDIUM", "dueDate": "2026-06-01"},
    ]
    _, result, _ = _generate(payload)
    assert result.scheduled_task_ids == {"due-today"}


def test_fixed_commitment_is_preserved_and_blocks_time(payload):
    payload["scheduledActivities"] = [{"id": "fixed", "eventType": "COMMITMENT", "schedulingMode": "FIXED", "taskId": None, "title": "Appointment", "startAt": "2026-06-01T09:00:00Z", "endAt": "2026-06-01T15:00:00Z", "timeZone": "UTC"}]
    _, result, prepared = _generate(payload)
    assert result.segments[0].start_minute >= to_minute(datetime.fromisoformat("2026-06-01T15:00:00+00:00"))
    assert prepared.occupied


def test_unavailable_interval_is_never_scheduled_over(payload):
    payload["unavailableIntervals"] = [{"id": "lunch", "startAt": "2026-06-01T11:00:00Z", "endAt": "2026-06-01T12:00:00Z", "timeZone": "UTC"}]
    _, result, prepared = _generate(payload)
    session = result.segments[0]
    session_end = session.start_minute + session.duration_minutes
    assert not any(session.start_minute < interval.end and session_end > interval.start for interval in prepared.occupied)


def test_adjacent_intervals_do_not_conflict_and_overlapping_ones_do(payload):
    payload["scheduledActivities"] = [
        {"id": "first", "eventType": "COMMITMENT", "schedulingMode": "FIXED", "taskId": None, "title": "A", "startAt": "2026-06-01T08:00:00Z", "endAt": "2026-06-01T09:00:00Z", "timeZone": "UTC"},
        {"id": "adjacent", "eventType": "TASK_SESSION", "schedulingMode": "FLEXIBLE", "taskId": "old-task", "title": "B", "startAt": "2026-06-01T09:00:00Z", "endAt": "2026-06-01T10:00:00Z", "timeZone": "UTC"},
    ]
    request = PlannerConstraintInput.model_validate(payload)
    from app.services.time_utils import existing_conflicts
    assert existing_conflicts(request) == []
    payload["scheduledActivities"][1]["startAt"] = "2026-06-01T08:30:00Z"
    request = PlannerConstraintInput.model_validate(payload)
    conflicts = existing_conflicts(request)
    assert len(conflicts) == 1
    assert conflicts[0]["existingEventId"] == "first"
    assert conflicts[0]["otherEventId"] == "adjacent"


def test_infeasible_deadline_task_is_returned_unscheduled(payload):
    payload["flexibleTasks"][0]["dueDate"] = "2026-05-31"
    _, result, _ = _generate(payload)
    assert result.status == "OPTIMAL"
    assert result.scheduled_task_ids == frozenset()


def test_splitting_is_all_or_nothing_and_exact(payload):
    payload["flexibleTasks"][0]["durationMinutes"] = 120
    payload["preferences"] = {"allowTaskSplitting": True, "preferredSessionMinutes": 60, "minimumSplitSessionMinutes": 30}
    payload["recurringAvailability"] = [
        {"id": "morning", "isoWeekday": 1, "startLocalTime": "09:00", "endLocalTime": "10:00", "timeZone": "UTC"},
        {"id": "afternoon", "isoWeekday": 1, "startLocalTime": "14:00", "endLocalTime": "15:00", "timeZone": "UTC"},
    ]
    _, result, _ = _generate(payload)
    assert "task-1" in result.scheduled_task_ids
    assert sum(segment.duration_minutes for segment in result.segments) == 120
    assert len(result.segments) == 2
    assert [item.session_index for item in result.segments] == [1, 2]


def test_solver_timeout_is_not_reported_as_infeasible(payload, monkeypatch):
    import app.services.scheduler as scheduler

    class TimeoutSolver:
        parameters = type("Parameters", (), {})()

        def Solve(self, _model):
            return scheduler.cp_model.UNKNOWN

    monkeypatch.setattr(scheduler.cp_model, "CpSolver", TimeoutSolver)
    _, result, _ = _generate(payload)
    assert result.status == "TIMEOUT"
    assert result.scheduled_task_ids == frozenset()


def test_generate_timeout_does_not_claim_a_partial_schedule(client, payload, monkeypatch):
    import app.services.scheduler as scheduler

    class TimeoutSolver:
        parameters = type("Parameters", (), {})()

        def Solve(self, _model):
            return scheduler.cp_model.UNKNOWN

    monkeypatch.setattr(scheduler.cp_model, "CpSolver", TimeoutSolver)
    response = client.post("/v1/plans/generate", json=payload, headers={"Authorization": "Bearer test-token-with-more-than-32-characters"})
    assert response.status_code == 200
    result = response.json()
    assert result["solverStatus"] == "TIMEOUT"
    assert result["proposedActivities"] == []
    warning = next(item["message"] for item in result["warnings"] if item["code"] == "SOLVER_TIMEOUT")
    assert "no partial schedule" in warning.lower()
    assert "valid partial solution was returned" not in warning.lower()


def test_identical_input_has_deterministic_placement(payload):
    _, first, _ = _generate(payload)
    _, second, _ = _generate(payload)
    assert first.segments == second.segments
from datetime import datetime

