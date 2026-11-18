"""Request contract for `POST /v1/agent/step`. Mirrored by `src/lib/intelligence-protocol.ts`.

Identity never appears here: no user id, no organization id. The Next.js server
has already authorized the request and decides which tools it may use; this
service needs only the product boundary, the user's clock and name, and the
conversation.
"""
from __future__ import annotations

from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.memory.selection import model as memory_selection_model
from app.tasks.signal import DATE, TaskSignal

STRICT = ConfigDict(extra="forbid")


class Message(BaseModel):
    model_config = STRICT
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=20_000)


class StartInput(BaseModel):
    model_config = STRICT
    product: Literal["lifestyle", "work"]
    timeZone: str | None = Field(default=None, max_length=64)
    displayName: str | None = Field(default=None, max_length=80)
    allowedTools: list[str] = Field(max_length=32)
    messages: list[Message] = Field(min_length=1, max_length=200)
    # The provider the Next.js server told the user about, and whether they accepted its data terms.
    expectedProvider: Literal["gemini", "ollama"]
    dataUseAcknowledged: bool

    @field_validator("timeZone")
    @classmethod
    def valid_zone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError("unknown time zone") from error
        return value

    @model_validator(mode="after")
    def boundary(self) -> "StartInput":
        if self.product == "work" and (self.timeZone or self.displayName):
            # WorkOS turns carry no personal LifestyleOS context.
            raise ValueError("work turns carry no personal context")
        if self.messages[-1].role != "user":
            raise ValueError("the last message must be the user's")
        return self


class ClientPayload(BaseModel):
    model_config = STRICT
    kind: Literal["draft", "planningProposal"]
    draftKind: Literal["task", "goal", "habit", "calendarEvent", "memory", "organizationMemory"] | None = None
    # The unsaved draft's fields, so Michael may repeat them. A planning proposal
    # sends nothing: its approval token and internal ids never leave the server.
    draft: dict[str, Any] | None = None

    @model_validator(mode="after")
    def shape(self) -> "ClientPayload":
        if (self.kind == "draft") != (self.draftKind is not None):
            raise ValueError("draftKind belongs to drafts only")
        if self.kind == "planningProposal" and self.draft is not None:
            raise ValueError("a planning proposal carries no data")
        return self


class ToolOutcome(BaseModel):
    model_config = STRICT
    callId: str = Field(min_length=1, max_length=160)
    status: Literal["completed", "failed", "invalid_arguments", "unavailable"]
    modelResult: Any = None
    clientPayload: ClientPayload | None = None


class ResumeInput(BaseModel):
    model_config = STRICT
    state: str = Field(min_length=1, max_length=3_500_000)
    outcome: ToolOutcome | None = None


class StepRequest(BaseModel):
    model_config = STRICT
    schemaVersion: Literal[1]
    correlationId: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    start: StartInput | None = None
    resume: ResumeInput | None = None

    @model_validator(mode="after")
    def one_kind(self) -> "StepRequest":
        if (self.start is None) == (self.resume is None):
            raise ValueError("send exactly one of start or resume")
        return self


# ---------------------------------------------------------------- task intelligence (Phase 4)
# Mirrored by `src/lib/intelligence-client.ts`. Like the step contract, these
# carry no identity: the Next.js server has authorized the request and sends
# only the records it is allowed to.


class PrioritizeRequest(BaseModel):
    model_config = STRICT
    schemaVersion: Literal[1]
    # "Today" on the owner's clock (LifestyleOS) or the organization's (WorkOS), computed by the server.
    asOfDate: str = Field(pattern=DATE)
    signals: list[TaskSignal] = Field(max_length=200)

    @model_validator(mode="after")
    def one_product_unique_refs(self) -> "PrioritizeRequest":
        if len({signal.product for signal in self.signals}) > 1:
            raise ValueError("one product per request")
        if len({signal.ref for signal in self.signals}) != len(self.signals):
            raise ValueError("refs must be unique")
        return self


class ClassifyRecord(BaseModel):
    model_config = STRICT
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5_000)


class ClassifyRequest(BaseModel):
    model_config = STRICT
    schemaVersion: Literal[1]
    product: Literal["lifestyle", "work"]
    record: ClassifyRecord
    # Same refusals as a chat turn: the provider the user was told about, and their data-terms acknowledgement.
    expectedProvider: Literal["gemini", "ollama"]
    dataUseAcknowledged: bool


_MEMORY_LIMITS = memory_selection_model().limits


class MemoryCandidate(BaseModel):
    model_config = STRICT
    # Request-local ("m1", "m2", ...): never a record id.
    ref: str = Field(pattern=r"^m[0-9]{1,4}$")
    text: str = Field(min_length=1, max_length=_MEMORY_LIMITS["maxTextChars"])
    # Whole days since the memory was saved, on the server's clock; only orders ties.
    ageDays: int = Field(ge=0, le=36_500)


class MemorySelectRequest(BaseModel):
    model_config = STRICT
    schemaVersion: Literal[1]
    product: Literal["lifestyle", "work"]
    query: str | None = Field(default=None, max_length=_MEMORY_LIMITS["maxQueryChars"])
    limit: int = Field(default=_MEMORY_LIMITS["defaultLimit"], ge=1, le=_MEMORY_LIMITS["maxLimit"])
    items: list[MemoryCandidate] = Field(max_length=_MEMORY_LIMITS["maxItems"])

    @model_validator(mode="after")
    def unique_refs(self) -> "MemorySelectRequest":
        if len({item.ref for item in self.items}) != len(self.items):
            raise ValueError("refs must be unique")
        return self


class HourOutcomes(BaseModel):
    model_config = STRICT
    hour: int = Field(ge=0, le=23)
    kept: int = Field(ge=0, le=100_000)
    deselected: int = Field(ge=0, le=100_000)


class ProposalsRequest(BaseModel):
    model_config = STRICT
    schemaVersion: Literal[1]
    sessionsByHour: list[HourOutcomes] = Field(max_length=24)
    suppressed: list[Literal["avoid_day_part:morning", "avoid_day_part:evening"]] = Field(default_factory=list, max_length=4)

    @model_validator(mode="after")
    def one_row_per_hour(self) -> "ProposalsRequest":
        if len({row.hour for row in self.sessionsByHour}) != len(self.sessionsByHour):
            raise ValueError("one row per hour")
        return self
