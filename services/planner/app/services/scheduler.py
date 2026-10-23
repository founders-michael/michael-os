from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime
from time import perf_counter
from zoneinfo import ZoneInfo

from ortools.sat.python import cp_model

from app.models.requests import FlexibleTask, PlannerConstraintInput
from app.services.time_utils import MinuteInterval, ceil_to_slot, deadline_end, to_minute


@dataclass
class TaskVariables:
    task: FlexibleTask
    scheduled: cp_model.IntVar
    whole_presence: cp_model.IntVar
    whole_start: cp_model.IntVar | None
    split_presence: cp_model.IntVar
    split_segments: list[tuple[cp_model.IntVar, int]]


@dataclass(frozen=True)
class ScheduledSegment:
    task_id: str
    start_minute: int
    duration_minutes: int
    session_index: int
    session_count: int


@dataclass(frozen=True)
class SolveResult:
    status: str
    segments: tuple[ScheduledSegment, ...]
    scheduled_task_ids: frozenset[str]
    duration_ms: int


def _allowed_starts(
    duration: int,
    intervals: tuple[MinuteInterval, ...],
    horizon_start: int,
    horizon_end: int,
    earliest: int | None,
    deadline: int | None,
) -> list[int]:
    lower = max(horizon_start, earliest if earliest is not None else horizon_start)
    upper = min(horizon_end, deadline if deadline is not None else horizon_end)
    values: list[int] = []
    for interval in intervals:
        start = ceil_to_slot(max(interval.start, lower))
        last_start = min(interval.end - duration, upper - duration)
        while start <= last_start:
            values.append(start)
            start += 15
    return sorted(set(values))


def _split_lengths(task: FlexibleTask, request: PlannerConstraintInput) -> list[int]:
    preferences = request.preferences
    if not preferences.allow_task_splitting or task.duration_minutes < preferences.minimum_split_session_minutes * 2:
        return []
    count = max(2, math.ceil(task.duration_minutes / preferences.preferred_session_minutes))
    count = min(count, 4, task.duration_minutes // preferences.minimum_split_session_minutes)
    if count < 2:
        return []
    base, remainder = divmod(task.duration_minutes, count)
    lengths = [base + (1 if index < remainder else 0) for index in range(count)]
    return lengths if min(lengths) >= preferences.minimum_split_session_minutes else []


def _deadline_for(task: FlexibleTask, request: PlannerConstraintInput) -> int | None:
    if task.due_date is None:
        return None
    return to_minute(deadline_end(task.due_date, request.user.time_zone))


def solve_plan(request: PlannerConstraintInput, placement_intervals: tuple[MinuteInterval, ...], *, require_all: bool = False, time_limit_seconds: float = 2.0) -> SolveResult:
    started = perf_counter()
    model = cp_model.CpModel()
    horizon_start = to_minute(request.horizon.from_)
    horizon_end = to_minute(request.horizon.to)
    tasks = sorted(request.flexible_tasks, key=lambda task: (task.priority, task.due_date or "9999-12-31", task.id))
    count = len(tasks)
    split_penalty = 1
    minute_weight = count + 1
    deadline_weight = count * 1440 * minute_weight + count * split_penalty + 1
    priority_weight = count * 8 * deadline_weight + count * 1440 * minute_weight + count * split_penalty + 1
    priority_tier = {"LOW": 1, "MEDIUM": count + 1, "HIGH": (count + 1) ** 2}
    buffered_intervals: list[cp_model.IntervalVar] = []
    task_variables: list[TaskVariables] = []
    objective_terms: list[cp_model.LinearExpr] = []
    start_variables: list[cp_model.IntVar] = []

    for index, task in enumerate(tasks):
        deadline = _deadline_for(task, request)
        earliest = to_minute(task.earliest_start) if task.earliest_start else None
        scheduled = model.NewBoolVar(f"task_{index}_scheduled")
        whole_presence = model.NewBoolVar(f"task_{index}_whole")
        split_presence = model.NewBoolVar(f"task_{index}_split")
        model.Add(whole_presence + split_presence == scheduled)
        if require_all:
            model.Add(scheduled == 1)

        whole_starts = _allowed_starts(task.duration_minutes, placement_intervals, horizon_start, horizon_end, earliest, deadline)
        whole_start_variable: cp_model.IntVar | None = None
        if whole_starts:
            whole_start_variable = model.NewIntVarFromDomain(cp_model.Domain.FromValues(whole_starts), f"task_{index}_whole_start")
            buffered_length = task.duration_minutes + request.preferences.minimum_break_minutes
            whole_end = model.NewIntVar(horizon_start, horizon_end + buffered_length, f"task_{index}_whole_buffer_end")
            whole_interval = model.NewOptionalIntervalVar(whole_start_variable, buffered_length, whole_end, whole_presence, f"task_{index}_whole_interval")
            model.Add(whole_end == whole_start_variable + buffered_length).OnlyEnforceIf(whole_presence)
            buffered_intervals.append(whole_interval)
            start_variables.append(whole_start_variable)
        else:
            model.Add(whole_presence == 0)

        split_segments: list[tuple[cp_model.IntVar, int]] = []
        split_lengths = _split_lengths(task, request)
        if split_lengths:
            for segment_index, duration in enumerate(split_lengths):
                starts = _allowed_starts(duration, placement_intervals, horizon_start, horizon_end, earliest, deadline)
                if not starts:
                    model.Add(split_presence == 0)
                    continue
                start_variable = model.NewIntVarFromDomain(cp_model.Domain.FromValues(starts), f"task_{index}_split_{segment_index}_start")
                buffered_length = duration + request.preferences.minimum_break_minutes
                end_variable = model.NewIntVar(horizon_start, horizon_end + buffered_length, f"task_{index}_split_{segment_index}_buffer_end")
                interval = model.NewOptionalIntervalVar(start_variable, buffered_length, end_variable, split_presence, f"task_{index}_split_{segment_index}_interval")
                model.Add(end_variable == start_variable + buffered_length).OnlyEnforceIf(split_presence)
                buffered_intervals.append(interval)
                start_variables.append(start_variable)
                split_segments.append((start_variable, duration))
        else:
            model.Add(split_presence == 0)

        task_variables.append(TaskVariables(task, scheduled, whole_presence, whole_start_variable, split_presence, split_segments))
        deadline_score = 0
        if task.due_date is not None:
            due = datetime.fromisoformat(task.due_date).date()
            local_start = request.horizon.from_.astimezone(ZoneInfo(request.user.time_zone)).date()
            deadline_score = max(0, min(8, 8 - (due - local_start).days))
        # Lexicographic tiers: priority class, nearer deadline, useful minutes, then fewer splits.
        objective_terms.append(scheduled * priority_tier[task.priority] * priority_weight)
        objective_terms.append(scheduled * deadline_score * deadline_weight)
        objective_terms.append(scheduled * task.duration_minutes * minute_weight)
        objective_terms.append(-split_presence * split_penalty)

    if buffered_intervals:
        model.AddNoOverlap(buffered_intervals)
    if start_variables:
        model.AddDecisionStrategy(start_variables, cp_model.CHOOSE_FIRST, cp_model.SELECT_MIN_VALUE)
    if objective_terms:
        model.Maximize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(0.05, min(time_limit_seconds, 10.0))
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 0
    solver.parameters.search_branching = cp_model.FIXED_SEARCH
    status_code = solver.Solve(model)
    status = {
        cp_model.OPTIMAL: "OPTIMAL",
        cp_model.FEASIBLE: "FEASIBLE",
        cp_model.INFEASIBLE: "INFEASIBLE",
        cp_model.UNKNOWN: "TIMEOUT",
        cp_model.MODEL_INVALID: "ERROR",
    }.get(status_code, "ERROR")

    segments: list[ScheduledSegment] = []
    scheduled_ids: set[str] = set()
    if status_code in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for variables in task_variables:
            if solver.Value(variables.scheduled) != 1:
                continue
            scheduled_ids.add(variables.task.id)
            if solver.Value(variables.whole_presence) == 1 and variables.whole_start is not None:
                segments.append(ScheduledSegment(variables.task.id, solver.Value(variables.whole_start), variables.task.duration_minutes, 1, 1))
            elif solver.Value(variables.split_presence) == 1:
                chosen = sorted((solver.Value(start), duration) for start, duration in variables.split_segments)
                total = len(chosen)
                for session_index, (start, duration) in enumerate(chosen, start=1):
                    segments.append(ScheduledSegment(variables.task.id, start, duration, session_index, total))

    segments.sort(key=lambda segment: (segment.start_minute, segment.task_id, segment.session_index))
    return SolveResult(status, tuple(segments), frozenset(scheduled_ids), int((perf_counter() - started) * 1000))
