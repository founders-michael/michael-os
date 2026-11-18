"""Deterministic task prioritization over `TaskSignal`s (CLAUDE.md §10.5).

No model is involved: the score is arithmetic over named components whose
weights and constants are published in `shared/intelligence/prioritization.json`.
Every ranked task carries its components and a reason code for each, so the
order can be explained (by `src/lib/task-priority-format.ts`, or by Michael
quoting the tool result) and overridden by changing the inputs the user owns:
priority, due date, goal links, estimates.

A component that cannot apply to a task is left out and the remaining weights
renormalized; it is never guessed. "Not applicable" is reported as such.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from typing import Any

from app.shared import load_shared_json
from app.tasks.signal import TaskSignal

PRIORITY_ORDER = {"low": 0, "medium": 1, "high": 2, "urgent": 3}


@dataclass(frozen=True)
class Model:
    version: str
    weights: dict[str, float]
    parameters: dict[str, Any]


@lru_cache(maxsize=1)
def model() -> Model:
    data = load_shared_json("intelligence/prioritization.json")
    if data.get("schemaVersion") != 1:
        raise ValueError("unsupported prioritization schema")
    weights = {component["name"]: float(component["weight"]) for component in data["components"]}
    if abs(sum(weights.values()) - 1.0) > 1e-9:
        raise ValueError("prioritization weights must sum to 1")
    return Model(version=data["modelVersion"], weights=weights, parameters=data["parameters"])


def _days_between(start: str, end: str) -> int:
    return (date.fromisoformat(end) - date.fromisoformat(start)).days


def _decay(days: int, half_life: float) -> float:
    """1 at or before day 0, halving every `half_life` days after."""
    return 1.0 if days <= 0 else 0.5 ** (days / half_life)


def _saturating(count: int) -> float:
    """0 for none, 0.5 for one, 0.75 for two, approaching 1."""
    return 1.0 - 0.5 ** count


def _component(name: str, value: float | None, reason: dict[str, Any]) -> dict[str, Any]:
    return {"name": name, "applicable": value is not None, "value": None if value is None else round(value, 4), "reason": reason}


def _user_priority(signal: TaskSignal, p: dict[str, Any]) -> dict[str, Any]:
    return _component("user_priority", p["priorityValues"][signal.priority], {"code": "PRIORITY", "priority": signal.priority})


def _due_proximity(signal: TaskSignal, today: str, p: dict[str, Any]) -> dict[str, Any]:
    if signal.dueDate is None:
        return _component("due_proximity", 0.0, {"code": "NO_DUE_DATE"})
    days = _days_between(today, signal.dueDate)
    if days < 0:
        reason = {"code": "OVERDUE", "days": -days}
    elif days == 0:
        reason = {"code": "DUE_TODAY"}
    else:
        reason = {"code": "DUE_IN", "days": days}
    return _component("due_proximity", _decay(days, p["dueHalfLifeDays"]), reason)


def _goal_alignment(signal: TaskSignal, today: str, p: dict[str, Any]) -> dict[str, Any]:
    half_life = p["targetHalfLifeDays"]
    goals = signal.alignment.goals
    if goals:
        dated = [_days_between(today, goal.targetDate) for goal in goals if goal.targetDate]
        nearest = min(dated) if dated else None
        urgency = _decay(nearest, half_life) if nearest is not None else 0.0
        value = p["goalBase"] + (1 - p["goalBase"]) * urgency
        return _component("goal_alignment", value, {"code": "SUPPORTS_GOALS", "count": len(goals), "nearestTargetInDays": nearest})
    project = signal.alignment.project
    if project is not None:
        days = _days_between(today, project.targetDate) if project.targetDate else None
        urgency = _decay(days, half_life) if days is not None else 0.0
        share = p["projectTargetShare"]
        value = p["projectPriorityValues"][project.priority] * ((1 - share) + share * urgency)
        return _component("goal_alignment", value, {"code": "IN_PROJECT", "projectPriority": project.priority, "targetInDays": days})
    return _component("goal_alignment", 0.0, {"code": "NOT_ALIGNED", "product": signal.product})


def _blocking_impact(signal: TaskSignal) -> dict[str, Any]:
    if signal.dependencies is None:
        return _component("blocking_impact", None, {"code": "NOT_APPLICABLE"})
    count = signal.dependencies.openDependents
    if count == 0:
        return _component("blocking_impact", 0.0, {"code": "BLOCKS_NOTHING"})
    return _component("blocking_impact", _saturating(count), {"code": "BLOCKS_TASKS", "count": count})


def _effort_vs_time_left(signal: TaskSignal, today: str, p: dict[str, Any]) -> dict[str, Any]:
    minutes = signal.remainingMinutes if signal.remainingMinutes is not None else signal.estimateMinutes
    if minutes is None:
        return _component("effort_vs_time_left", None, {"code": "NO_ESTIMATE"})
    if signal.dueDate is None:
        return _component("effort_vs_time_left", None, {"code": "NO_DUE_DATE"})
    # Today counts as a day; an overdue task has only today left.
    days_left = max(1, _days_between(today, signal.dueDate) + 1)
    value = min(1.0, minutes / (days_left * p["focusMinutesPerDay"]))
    return _component("effort_vs_time_left", value, {"code": "EFFORT_VS_TIME", "minutes": minutes, "daysLeft": days_left})


def _postponement_history(signal: TaskSignal) -> dict[str, Any]:
    if signal.postponements is None:
        return _component("postponement_history", None, {"code": "NOT_RECORDED"})
    if signal.postponements == 0:
        return _component("postponement_history", 0.0, {"code": "NEVER_POSTPONED"})
    return _component("postponement_history", _saturating(signal.postponements), {"code": "POSTPONED", "count": signal.postponements})


def _blocked_reason(signal: TaskSignal) -> dict[str, Any] | None:
    blockers = signal.dependencies.openBlockers if signal.dependencies else 0
    if blockers:
        return {"code": "WAITING_ON_BLOCKERS", "count": blockers}
    if signal.status == "blocked":
        return {"code": "STATUS_BLOCKED"}
    return None


def score(signal: TaskSignal, today: str) -> dict[str, Any]:
    m = model()
    p = m.parameters
    components = [
        _user_priority(signal, p),
        _due_proximity(signal, today, p),
        _goal_alignment(signal, today, p),
        _blocking_impact(signal),
        _effort_vs_time_left(signal, today, p),
        _postponement_history(signal),
    ]
    applicable_weight = sum(m.weights[c["name"]] for c in components if c["applicable"])
    total = 0.0
    for component in components:
        weight = m.weights[component["name"]]
        component["weight"] = weight
        if component["applicable"]:
            contribution = 100 * weight * component["value"] / applicable_weight
            component["contribution"] = round(contribution, 2)
            total += contribution
        else:
            component["contribution"] = None
    blocked = _blocked_reason(signal)
    return {"ref": signal.ref, "score": round(total, 1), "actionable": blocked is None, "blockedReason": blocked, "components": components}


def prioritize(signals: list[TaskSignal], today: str) -> dict[str, Any]:
    """Rank open tasks. Ties fall to due date, then priority, then the order given."""
    scored = [(index, signal, score(signal, today)) for index, signal in enumerate(signals)]
    scored.sort(key=lambda item: (
        not item[2]["actionable"],
        -item[2]["score"],
        item[1].dueDate is None,
        item[1].dueDate or "",
        -PRIORITY_ORDER[item[1].priority],
        item[0],
    ))
    ranked = [{"rank": position + 1, **result} for position, (_, _, result) in enumerate(scored)]
    return {"modelVersion": model().version, "asOfDate": today, "weights": model().weights, "ranked": ranked}
