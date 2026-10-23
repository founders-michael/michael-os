from __future__ import annotations

import os
import math
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    planner_service_token: str
    solver_time_limit_seconds: float = 2.0


def get_settings() -> Settings:
    token = os.environ.get("PLANNER_SERVICE_TOKEN", "")
    try:
        solver_limit = float(os.environ.get("PLANNER_SOLVER_TIME_LIMIT_SECONDS", "2"))
    except ValueError:
        solver_limit = 2.0
    if not math.isfinite(solver_limit):
        solver_limit = 2.0
    return Settings(planner_service_token=token, solver_time_limit_seconds=min(10.0, max(0.05, solver_limit)))
