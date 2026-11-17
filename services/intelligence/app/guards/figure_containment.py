"""Michael interprets numbers he did not compute.

The only implementation (the TypeScript one was removed in Phase 2): every figure in a reply must appear
in a tool result (or the user's own words); anything else was made up.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any

DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}", re.ASCII)
NUMBER_PATTERN = re.compile(r"-?\d+(?:,\d{3})*(?:\.\d+)?", re.ASCII)
DISCOURSE_NUMBERS = {0, 1, 2, 3}


def _number(raw: str) -> float | None:
    try:
        value = float(raw.replace(",", ""))
    except (ValueError, OverflowError):
        return None
    return value if math.isfinite(value) else None


def _figures_in_text(text: str) -> list[dict[str, Any]]:
    figures: list[dict[str, Any]] = [{"kind": "date", "value": date} for date in DATE_PATTERN.findall(text)]
    for match in NUMBER_PATTERN.findall(DATE_PATTERN.sub(" ", text)):
        value = _number(match)
        if value is not None:
            figures.append({"kind": "number", "value": value})
    return figures


def extract_figures(text: str) -> list[dict[str, Any]]:
    return _figures_in_text(text)


def collect_tool_figures(value: Any) -> list[dict[str, Any]]:
    if value is None or isinstance(value, bool):
        return []
    if isinstance(value, (int, float)):
        return [{"kind": "number", "value": float(value)}] if math.isfinite(value) else []
    if isinstance(value, str):
        return _figures_in_text(value)
    if isinstance(value, list):
        return [figure for entry in value for figure in collect_tool_figures(entry)]
    if isinstance(value, dict):
        return [figure for entry in value.values() for figure in collect_tool_figures(entry)]
    return []


@dataclass
class ContainmentResult:
    contained: bool
    uncontained: list[dict[str, Any]] = field(default_factory=list)
    checked_figure_count: int = 0


def check_figure_containment(response_text: str, tool_results: list[Any], allow_discourse_numbers: bool = True) -> ContainmentResult:
    allowed: set[float] = set()
    allowed_dates: set[str] = set()
    for result in tool_results:
        for figure in collect_tool_figures(result):
            if figure["kind"] == "number":
                allowed.add(figure["value"])
            else:
                allowed_dates.add(figure["value"])
                for part in figure["value"].split("-"):
                    allowed.add(float(part))
    stated = extract_figures(response_text)
    uncontained = []
    for figure in stated:
        if figure["kind"] == "date":
            if figure["value"] not in allowed_dates:
                uncontained.append(figure)
        elif figure["value"] not in allowed and not (allow_discourse_numbers and figure["value"] in DISCOURSE_NUMBERS):
            uncontained.append(figure)
    return ContainmentResult(contained=not uncontained, uncontained=uncontained, checked_figure_count=len(stated))


def describe_containment_failure(result: ContainmentResult) -> str:
    if result.contained:
        return ""
    def shown(figure: dict[str, Any]) -> str:
        if figure["kind"] == "date":
            return figure["value"]
        value = figure["value"]
        return str(int(value)) if float(value).is_integer() else str(value)
    return f"Response stated {len(result.uncontained)} figure(s) absent from every tool result: {', '.join(shown(f) for f in result.uncontained)}"
