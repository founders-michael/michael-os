"""Michael's evaluation harness (Phase 6, CLAUDE.md §10.10).

Each case is one chat turn with fixed tool data. The harness runs the real
engine (`app.orchestration.agent`: instruction, prefetch, tool loop, guards)
in-process and plays the Next.js side itself, answering each tool from the
case's fixtures — no database, no server, no user data. Memory lookups are
ranked by the real selection code, so a case also tests recall.

Two modes:
  - scripted (CI, `tests/test_evals.py`): the "model" calls the case's expected
    tools and then gives the case's reference answer. This proves every case is
    satisfiable and that the guards let a correct answer through unchanged —
    a guard that rewrites a correct answer fails here.
  - live (`npm run eval:live`): the configured provider answers; the report
    scores tool choice, answer content, forbidden claims and latency.

A case passes only if every expectation holds. Security and business rules are
never judged here: they have deterministic tests of their own.
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.config import Limits, ProviderSettings
from app.memory.selection import select
from app.orchestration import agent
from app.providers.base import ProviderResponse, ToolCall, ToolResult
from app.tools.catalog import catalog

DATASETS = Path(__file__).parent / "datasets"
STRICT = ConfigDict(extra="forbid")
MEMORY_TOOLS = {"get_my_memories", "get_organization_memories"}
DRAFT_KINDS = {
    "draft_task": "task", "draft_goal": "goal", "draft_habit": "habit", "draft_calendar_event": "calendarEvent",
    "draft_memory": "memory", "draft_organization_memory": "organizationMemory",
}


class Expect(BaseModel):
    model_config = STRICT
    # Each inner list is "at least one of these tools ran" (the memory prefetch counts).
    toolsAll: list[list[str]] = Field(default_factory=list)
    toolsNone: list[str] = Field(default_factory=list)
    answerMatches: list[str] = Field(default_factory=list)
    answerForbids: list[str] = Field(default_factory=list)
    draftKinds: list[str] = Field(default_factory=list)


class Case(BaseModel):
    model_config = STRICT
    id: str = Field(pattern=r"^[a-z0-9.-]+$")
    product: Literal["lifestyle", "work"]
    message: str = Field(min_length=1, max_length=2_000)
    # Saved memory texts; the memory tools are answered by ranking these for the question.
    memories: list[str] = Field(default_factory=list)
    # Model-facing results by tool name. A tool not listed returns an empty result.
    tools: dict[str, Any] = Field(default_factory=dict)
    expect: Expect
    # A correct answer, used by the scripted mode in CI.
    reference: str = Field(min_length=1)
    # The tools the scripted model calls before answering (the reference may need their figures).
    referenceTools: list[str] = Field(default_factory=list)


class Dataset(BaseModel):
    model_config = STRICT
    schemaVersion: Literal[1]
    version: str
    description: str
    cases: list[Case]


def load(name: str = "michael-v1") -> Dataset:
    data = json.loads((DATASETS / f"{name}.json").read_text(encoding="utf-8"))
    dataset = Dataset(**data)
    known = catalog()
    for case in dataset.cases:
        named = {*case.tools, *case.referenceTools, *case.expect.toolsNone, *(t for group in case.expect.toolsAll for t in group)}
        for tool in named:
            if tool not in known:
                raise ValueError(f"{case.id}: unknown tool {tool}")
        for tool in {*case.tools, *case.referenceTools, *(t for group in case.expect.toolsAll for t in group)}:
            if known[tool].product != case.product:
                raise ValueError(f"{case.id}: {tool} is not a {case.product} tool")
    if len({case.id for case in dataset.cases}) != len(dataset.cases):
        raise ValueError("duplicate case ids")
    return dataset


def tools_for(product: str) -> list[str]:
    return [name for name, declaration in catalog().items() if declaration.product == product]


def memory_result(case: Case, about: str | None) -> dict[str, Any]:
    """What the server's memory tool returns: the same ranking, over the case's memories."""
    items = [{"ref": f"m{i + 1}", "text": text, "ageDays": i} for i, text in enumerate(case.memories)]
    if not items:
        return {"savedMemories": 0, "matchedQuestion": False, "memories": []}
    selection = select(about or None, items, 8)
    by_ref = {item["ref"]: item["text"] for item in items}
    return {
        "savedMemories": len(items), "matchedQuestion": selection["matchedCount"] > 0,
        "memories": [{"text": by_ref[row["ref"]], "writtenOn": "2026-11-18", "aboutThisQuestion": row["matched"]} for row in selection["selected"]],
    }


def run_tool(case: Case, call: dict[str, Any]) -> dict[str, Any]:
    name = call["name"]
    if name in MEMORY_TOOLS:
        about = call["arguments"].get("about") if isinstance(call["arguments"], dict) else None
        return {"status": "completed", "modelResult": memory_result(case, about)}
    if name in DRAFT_KINDS:
        kind = DRAFT_KINDS[name]
        result = {"saved": False, "kind": kind, "draftPresentedToUser": True, "missingRequiredDetails": [], "readyToSave": True,
                  "nextStep": "Tell the user the draft is below and that it is kept only if they press Save."}
        return {"status": "completed", "modelResult": result,
                "clientPayload": {"kind": "draft", "draftKind": kind, "draft": {"kind": kind, "values": call["arguments"]}}}
    return {"status": "completed", "modelResult": case.tools.get(name, {"note": "Nothing recorded for this case."})}


@dataclass
class Outcome:
    case_id: str
    passed: bool
    answer: str
    tools: list[str]
    draft_kinds: list[str]
    failures: list[str] = field(default_factory=list)
    seconds: float = 0.0
    error: str | None = None


def check(case: Case, answer: str, tools: list[str], draft_kinds: list[str]) -> list[str]:
    failures = []
    for group in case.expect.toolsAll:
        if not set(group) & set(tools):
            failures.append(f"none of {group} ran")
    for tool in case.expect.toolsNone:
        if tool in tools:
            failures.append(f"{tool} ran")
    for pattern in case.expect.answerMatches:
        if not re.search(pattern, answer):
            failures.append(f"answer lacks /{pattern}/")
    for pattern in case.expect.answerForbids:
        if re.search(pattern, answer):
            failures.append(f"answer has forbidden /{pattern}/")
    for kind in case.expect.draftKinds:
        if kind not in draft_kinds:
            failures.append(f"no {kind} draft")
    return failures


async def run_case(case: Case, provider: Any, settings: ProviderSettings, limits: Limits) -> Outcome:
    ctx = agent.StepContext(provider=provider, settings=settings, limits=limits)
    started = time.monotonic()
    state = agent.new_state(
        product=case.product, time_zone="Asia/Kolkata" if case.product == "lifestyle" else None,
        display_name="Sam" if case.product == "lifestyle" else None, allowed_tools=tools_for(case.product),
        messages=[{"role": "user", "content": case.message}], correlation_id=f"eval-{case.id}"[:60], ctx=ctx)
    tools: list[str] = []
    draft_kinds: list[str] = []
    try:
        step = await agent.start(state, ctx)
        while step["action"] in ("execute", "compose"):
            if step["action"] == "execute":
                outcome = run_tool(case, step["call"])
                tools.append(step["call"]["name"])
                if "clientPayload" in outcome:
                    draft_kinds.append(outcome["clientPayload"]["draftKind"])
                step = await agent.run_step(step["state"], ctx, {"callId": step["call"]["id"], **outcome})
            else:
                step = await agent.run_step(step["state"], ctx, None)
    except Exception as error:  # A failed turn is a failed case, reported, not a crash of the run.
        return Outcome(case.id, False, "", tools, draft_kinds, [f"turn failed: {type(error).__name__}"], time.monotonic() - started, getattr(error, "code", str(error))[:120])
    if step["action"] == "error":
        return Outcome(case.id, False, "", tools, draft_kinds, [f"engine error {step.get('code')}"], time.monotonic() - started, step.get("code"))
    answer = step["message"]
    # Judged on what the reply was built from (the engine's activity), not on every lookup that ran:
    # the memory prefetch always runs, but counts only when a memory matched.
    used = [activity["name"] for activity in step["toolActivity"] if activity["status"] == "completed"]
    failures = check(case, answer, used, draft_kinds)
    return Outcome(case.id, not failures, answer, used, draft_kinds, failures, time.monotonic() - started)


class ReferenceModel:
    """Scripted mode: calls the case's reference tools (once), then gives the reference answer."""

    def __init__(self, case: Case):
        self.case = case

    async def generate(self, *, model: str, system_instruction: str, messages: list[dict[str, str]], tools: list[dict[str, Any]], timeout_s: float) -> ProviderResponse:
        if self.case.referenceTools:
            calls = [ToolCall(f"ref-{i}", name, self._arguments(name)) for i, name in enumerate(self.case.referenceTools)]
            return ProviderResponse(text="", tool_calls=calls, continuation={"step": 1})
        return ProviderResponse(text=self.case.reference)

    async def continue_with_tools(self, *, model: str, system_instruction: str, tools: list[dict[str, Any]], continuation: Any, results: list[ToolResult], timeout_s: float) -> ProviderResponse:
        return ProviderResponse(text=self.case.reference)

    def _arguments(self, name: str) -> dict[str, Any]:
        if name in MEMORY_TOOLS:
            return {"about": self.case.message[:200]}
        if name in DRAFT_KINDS:
            return {"content": self.case.message[:200]} if "memory" in name else {"title": self.case.message[:160]}
        return {}


def summarize(outcomes: list[Outcome]) -> dict[str, Any]:
    seconds = sorted(outcome.seconds for outcome in outcomes)
    def percentile(p: float) -> float:
        return round(seconds[min(len(seconds) - 1, int(p * len(seconds)))], 2) if seconds else 0.0
    by_area: dict[str, list[bool]] = {}
    for outcome in outcomes:
        by_area.setdefault(outcome.case_id.split(".")[0], []).append(outcome.passed)
    return {
        "cases": len(outcomes),
        "passed": sum(outcome.passed for outcome in outcomes),
        "passRate": round(sum(outcome.passed for outcome in outcomes) / len(outcomes), 3) if outcomes else 0.0,
        "byArea": {area: f"{sum(results)}/{len(results)}" for area, results in sorted(by_area.items())},
        "secondsP50": percentile(0.5),
        "secondsP90": percentile(0.9),
    }
