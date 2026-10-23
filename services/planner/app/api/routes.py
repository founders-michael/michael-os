from __future__ import annotations

from datetime import UTC, datetime
from time import perf_counter
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import get_settings
from app.models.requests import FlexibleTask, PlannerConstraintInput
from app.models.responses import FeasibilityResponse, HealthResponse, PlannerProposal, ReadinessResponse
from app.security.authentication import require_planner_token
from app.services.feasibility import check_feasibility
from app.services.scheduler import solve_plan
from app.services.time_utils import MinuteInterval, deadline_end, existing_conflicts, prepare_intervals, to_minute, from_minute

router = APIRouter()
protected = APIRouter(dependencies=[Depends(require_planner_token)])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/ready", response_model=ReadinessResponse)
def readiness() -> ReadinessResponse:
    ready = len(get_settings().planner_service_token) >= 32
    return ReadinessResponse(status="ready" if ready else "not_ready", planningEnabled=ready)


def _can_fit_contiguously(intervals: tuple[MinuteInterval, ...], task: FlexibleTask, lower_bound: int, upper_bound: int) -> bool:
    return any(
        min(interval.end, upper_bound) - max(interval.start, lower_bound) >= task.duration_minutes
        for interval in intervals
        if interval.start < upper_bound and interval.end > lower_bound
    )


@protected.post("/v1/plans/feasibility")
def feasibility(request: PlannerConstraintInput) -> FeasibilityResponse:
    return check_feasibility(request, time_limit_seconds=get_settings().solver_time_limit_seconds)


@protected.post("/v1/plans/generate", response_model=PlannerProposal)
def generate(request: PlannerConstraintInput) -> PlannerProposal:
    started = perf_counter()
    prepared = prepare_intervals(request)
    result = solve_plan(request, prepared.placement_free, time_limit_seconds=get_settings().solver_time_limit_seconds)
    if result.status == "ERROR":
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={"error": "SOLVER_FAILURE", "message": "The solver encountered an internal failure."})
    if result.status == "INFEASIBLE":
        # Partial plans are modeled as optional tasks, so INFEASIBLE indicates a model failure.
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail={"error": "SOLVER_INFEASIBLE", "message": "The solver could not construct a valid partial plan."})

    scheduled_ids = set(result.scheduled_task_ids)
    task_by_id = {task.id: task for task in request.flexible_tasks}
    proposed = []
    for segment in result.segments:
        task = task_by_id[segment.task_id]
        proposed.append({
            "taskId": segment.task_id,
            "startAt": from_minute(segment.start_minute),
            "endAt": from_minute(segment.start_minute + segment.duration_minutes),
            "timeZone": request.user.time_zone,
            "durationMinutes": segment.duration_minutes,
            "sessionIndex": segment.session_index,
            "sessionCount": segment.session_count,
        })

    unscheduled = []
    for task in request.flexible_tasks:
        if task.id in scheduled_ids:
            continue
        earliest = to_minute(task.earliest_start) if task.earliest_start else to_minute(request.horizon.from_)
        deadline = to_minute(deadline_end(task.due_date, request.user.time_zone)) if task.due_date else to_minute(request.horizon.to)
        can_fit_in_horizon = _can_fit_contiguously(prepared.placement_free, task, earliest, to_minute(request.horizon.to))
        can_fit_before_deadline = _can_fit_contiguously(prepared.placement_free, task, earliest, min(deadline, to_minute(request.horizon.to)))
        if not request.recurring_availability:
            code, reason = "AVAILABILITY_UNCONFIGURED", "No availability is configured, so no scheduling time was assumed."
        elif task.due_date and to_minute(request.horizon.from_) >= deadline:
            code, reason = "DEADLINE_PASSED", "The task deadline is before the available planning horizon."
        elif task.due_date and not request.preferences.allow_task_splitting and deadline < to_minute(request.horizon.to) and can_fit_in_horizon and not can_fit_before_deadline:
            code, reason = "DEADLINE_CANNOT_BE_MET", "No sufficiently long available interval remains before this task's deadline."
        elif not prepared.free:
            code, reason = "INSUFFICIENT_TOTAL_CAPACITY", "No free time remains inside configured availability."
        elif not any(interval.duration >= task.duration_minutes for interval in prepared.placement_free) and not request.preferences.allow_task_splitting:
            code, reason = "INSUFFICIENT_CONTINUOUS_TIME", "No continuous available interval is long enough for this task."
        elif result.status == "TIMEOUT":
            code, reason = "SOLVER_TIMEOUT", "The solver reached its time limit before placing this task."
        elif any({"LOW": 1, "MEDIUM": 2, "HIGH": 3}[item.priority] > {"LOW": 1, "MEDIUM": 2, "HIGH": 3}[task.priority] for item in request.flexible_tasks if item.id in scheduled_ids):
            code, reason = "HIGHER_PRIORITY_TASKS_SCHEDULED", "Available time was assigned to higher-priority tasks."
        else:
            code, reason = "SOLVER_COULD_NOT_PLACE_TASK", "The task could not be placed while satisfying all scheduling constraints."
        unscheduled.append({"taskId": task.id, "reasonCode": code, "reason": reason})

    warnings = [{"code": code, "message": message} for code, message in prepared.warnings]
    if result.status == "TIMEOUT":
        warnings.append({"code": "SOLVER_TIMEOUT", "message": "The solver reached its time limit before finding a feasible schedule; no partial schedule is being proposed."})
    conflicts = existing_conflicts(request)
    if conflicts:
        warnings.append({"code": "EXISTING_CALENDAR_CONFLICTS", "message": "Existing calendar intervals overlap; they were preserved and treated as occupied."})
    minutes_available = sum(interval.duration for interval in prepared.available)
    minutes_scheduled = sum(segment.duration_minutes for segment in result.segments)
    return PlannerProposal(
        requestId=str(uuid4()),
        horizon={"from": request.horizon.from_, "to": request.horizon.to},
        timeZone=request.user.time_zone,
        solverStatus=result.status,
        planningDurationMs=max(result.duration_ms, int((perf_counter() - started) * 1000)),
        generatedAt=datetime.now(UTC),
        proposedActivities=proposed,
        explanations=[],
        unscheduledTasks=unscheduled,
        conflicts=conflicts,
        warnings=warnings,
        summary={
            "tasksRequested": len(request.flexible_tasks),
            "tasksScheduled": len(scheduled_ids),
            "tasksUnscheduled": len(unscheduled),
            "minutesScheduled": minutes_scheduled,
            "minutesAvailable": minutes_available,
            "minutesRequired": sum(task.duration_minutes for task in request.flexible_tasks),
        },
    )


router.include_router(protected)
