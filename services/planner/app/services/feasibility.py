from __future__ import annotations

from datetime import UTC, datetime
from time import perf_counter
from uuid import uuid4

from app.models.requests import PlannerConstraintInput
from app.models.responses import FeasibilityResponse
from app.services.scheduler import solve_plan
from app.services.time_utils import existing_conflicts, from_minute, prepare_intervals, to_minute


def check_feasibility(request: PlannerConstraintInput, *, time_limit_seconds: float = 2.0) -> FeasibilityResponse:
    """Return solver-confirmed feasibility for all requested tasks as one atomic set."""
    started = perf_counter()
    prepared = prepare_intervals(request)
    result = solve_plan(request, prepared.placement_free, require_all=True, time_limit_seconds=time_limit_seconds)
    available_minutes = sum(item.duration for item in prepared.available)
    occupied_minutes = sum(item.duration for item in prepared.occupied)
    required_minutes = sum(task.duration_minutes for task in request.flexible_tasks)
    violations = []
    if not request.recurring_availability and request.flexible_tasks:
        violations.append({"code": "AVAILABILITY_UNCONFIGURED", "message": "Configure availability before requesting a complete feasible plan."})
    elif result.status == "INFEASIBLE":
        violations.append({"code": "TASK_SET_CANNOT_FIT", "message": "The complete requested task set cannot be placed within availability and constraints."})
    elif result.status == "TIMEOUT":
        violations.append({"code": "FEASIBILITY_TIMEOUT", "message": "The solver did not establish feasibility within its time limit."})
    elif result.status == "ERROR":
        violations.append({"code": "SOLVER_FAILURE", "message": "The solver encountered an internal failure."})

    horizon = {"from": request.horizon.from_, "to": request.horizon.to}
    return FeasibilityResponse(
        requestId=str(uuid4()),
        horizon=horizon,
        timeZone=request.user.time_zone,
        isFeasible=True if result.status in {"OPTIMAL", "FEASIBLE"} else False if result.status == "INFEASIBLE" else None,
        solverStatus=result.status,
        availableMinutes=available_minutes,
        occupiedMinutes=occupied_minutes,
        requiredTaskMinutes=required_minutes,
        freeIntervals=[{"startAt": from_minute(interval.start), "endAt": from_minute(interval.end), "durationMinutes": interval.duration} for interval in prepared.free],
        violations=violations,
        warnings=[{"code": code, "message": message} for code, message in prepared.warnings] + ([{"code": "EXISTING_CALENDAR_CONFLICTS", "message": "Existing calendar intervals overlap; they were preserved and treated as occupied."}] if existing_conflicts(request) else []),
        checkedAt=datetime.now(UTC),
        checkDurationMs=int((perf_counter() - started) * 1000),
    )
