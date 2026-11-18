"""Preference proposals from planning outcomes (Phase 6).

Deterministic, no model: the rules and thresholds are published in
`shared/intelligence/feedback.json`. The input is one user's applied-plan
outcomes counted per local start hour; nothing identifies the user, a task or
a date. A proposal is only ever shown to the user, with its evidence, and is
applied by the Next.js server when — and only when — they press Apply.

One rule today, AVOID_DAY_PART: when the user keeps removing the sessions the
planner puts in one part of the day while keeping most of the others, propose
that the planner stop using that part (by moving the edge of their
availability). Both conditions matter: removing everything says nothing about
the time of day.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from app.shared import load_shared_json


@dataclass(frozen=True)
class ProposalModel:
    version: str
    day_parts: dict[str, dict[str, Any]]
    min_in: int
    min_share_in: float
    min_outside: int
    max_share_outside: float


@lru_cache(maxsize=1)
def model() -> ProposalModel:
    data = load_shared_json("intelligence/feedback.json")
    if data.get("schemaVersion") != 1:
        raise ValueError("unsupported feedback schema")
    rule = data["proposals"]["avoidDayPart"]
    return ProposalModel(
        version=data["modelVersion"], day_parts=rule["dayParts"],
        min_in=int(rule["minProposedInPart"]), min_share_in=float(rule["minDeselectedShareInPart"]),
        min_outside=int(rule["minProposedOutside"]), max_share_outside=float(rule["maxDeselectedShareOutside"]),
    )


def propose(sessions_by_hour: list[dict[str, int]], suppressed: list[str]) -> dict[str, Any]:
    current = model()
    proposals = []
    for part, spec in current.day_parts.items():
        key = f"avoid_day_part:{part}"
        if key in suppressed:
            continue
        first, last = spec["hours"]
        inside = [row for row in sessions_by_hour if first <= row["hour"] <= last]
        outside = [row for row in sessions_by_hour if not first <= row["hour"] <= last]
        proposed_in = sum(row["kept"] + row["deselected"] for row in inside)
        deselected_in = sum(row["deselected"] for row in inside)
        proposed_out = sum(row["kept"] + row["deselected"] for row in outside)
        deselected_out = sum(row["deselected"] for row in outside)
        if proposed_in < current.min_in or proposed_out < current.min_outside:
            continue
        if deselected_in / proposed_in < current.min_share_in or deselected_out / proposed_out > current.max_share_outside:
            continue
        proposals.append({
            "key": key, "kind": "AVOID_DAY_PART", "dayPart": part,
            "change": {"field": spec["change"]["field"], "value": spec["change"]["value"]},
            "evidence": {"proposedInPart": proposed_in, "deselectedInPart": deselected_in, "proposedOutside": proposed_out, "deselectedOutside": deselected_out},
        })
    return {"modelVersion": current.version, "proposals": proposals}
