"""`TaskSignal`: one open task in the shape every task-intelligence module reads.

Mirrors `shared/intelligence/task-signal.schema.json` (a test keeps the two
equal). Built on the Next.js side from `Task` or `WorkTask`, so nothing here
knows which table a task came from, and nothing is written twice per product
(CLAUDE.md §10.5). Extra fields are rejected: an identity field cannot ride in.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

STRICT = ConfigDict(extra="forbid")
DATE = r"^\d{4}-\d{2}-\d{2}$"


class ActualEffort(BaseModel):
    model_config = STRICT
    # Planned is not actual: there is no actual-effort data, and the signal says so.
    available: Literal[False]


class Dependencies(BaseModel):
    model_config = STRICT
    openBlockers: int = Field(ge=0, le=10_000)
    openDependents: int = Field(ge=0, le=10_000)


class Assignment(BaseModel):
    model_config = STRICT
    assigneeCount: int = Field(ge=0, le=1_000)
    assignedToViewer: bool


class GoalLink(BaseModel):
    model_config = STRICT
    targetDate: str | None = Field(pattern=DATE)


class ProjectLink(BaseModel):
    model_config = STRICT
    priority: Literal["low", "medium", "high"]
    targetDate: str | None = Field(pattern=DATE)


class Alignment(BaseModel):
    model_config = STRICT
    goals: list[GoalLink] = Field(max_length=5)
    project: ProjectLink | None


class TaskSignal(BaseModel):
    model_config = STRICT
    ref: str = Field(pattern=r"^[A-Za-z0-9_-]{1,40}$")
    product: Literal["lifestyle", "work"]
    title: str = Field(min_length=1, max_length=200)
    status: Literal["todo", "in_progress", "in_review", "blocked"]
    priority: Literal["low", "medium", "high", "urgent"]
    dueDate: str | None = Field(pattern=DATE)
    createdDate: str = Field(pattern=DATE)
    estimateMinutes: int | None = Field(ge=0, le=100_000)
    remainingMinutes: int | None = Field(ge=0, le=100_000)
    actualEffort: ActualEffort
    dependencies: Dependencies | None
    assignment: Assignment | None
    alignment: Alignment
    postponements: int | None = Field(ge=0, le=10_000)
