from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.models.requests import to_camel


class ResponseModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


SolverStatus = Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "TIMEOUT", "ERROR"]


class ProposedActivity(ResponseModel):
    existing_event_id: str | None = None
    task_id: str
    start_at: datetime
    end_at: datetime
    time_zone: str
    duration_minutes: int
    session_index: int
    session_count: int


class UnscheduledTask(ResponseModel):
    task_id: str
    reason_code: Literal[
        "AVAILABILITY_UNCONFIGURED",
        "DEADLINE_PASSED",
        "DEADLINE_CANNOT_BE_MET",
        "INSUFFICIENT_CONTINUOUS_TIME",
        "INSUFFICIENT_TOTAL_CAPACITY",
        "HIGHER_PRIORITY_TASKS_SCHEDULED",
        "SOLVER_TIMEOUT",
        "SOLVER_COULD_NOT_PLACE_TASK",
    ]
    reason: str


class PlanWarning(ResponseModel):
    code: str
    message: str


class PlanConflict(ResponseModel):
    existing_event_id: str
    other_event_id: str
    proposed_task_id: str | None = None
    start_at: datetime
    end_at: datetime
    event_type: str


class PlanExplanation(ResponseModel):
    task_id: str | None = None
    code: str
    message: str


class PlanSummary(ResponseModel):
    tasks_requested: int
    tasks_scheduled: int
    tasks_unscheduled: int
    minutes_scheduled: int
    minutes_available: int
    minutes_required: int


class PlannerProposal(ResponseModel):
    request_id: str
    horizon: dict[str, datetime]
    time_zone: str
    solver_status: SolverStatus
    planning_duration_ms: int
    generated_at: datetime
    proposed_activities: list[ProposedActivity]
    explanations: list[PlanExplanation]
    unscheduled_tasks: list[UnscheduledTask]
    conflicts: list[PlanConflict]
    warnings: list[PlanWarning]
    summary: PlanSummary


class FreeInterval(ResponseModel):
    start_at: datetime
    end_at: datetime
    duration_minutes: int


class ConstraintViolation(ResponseModel):
    code: str
    message: str
    task_id: str | None = None


class FeasibilityResponse(ResponseModel):
    request_id: str
    horizon: dict[str, datetime]
    time_zone: str
    is_feasible: bool | None
    solver_status: SolverStatus
    available_minutes: int
    occupied_minutes: int
    required_task_minutes: int
    free_intervals: list[FreeInterval]
    violations: list[ConstraintViolation]
    warnings: list[PlanWarning]
    checked_at: datetime
    check_duration_ms: int


class HealthResponse(ResponseModel):
    status: Literal["ok"]


class ReadinessResponse(ResponseModel):
    status: Literal["ready", "not_ready"]
    planning_enabled: bool
