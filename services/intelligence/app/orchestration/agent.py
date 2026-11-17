"""Michael's turn, run one step at a time.

Carried over from the removed TypeScript `runAIAgent`, with one structural change: this
service never runs a tool. When the model asks for one, the step returns
`execute` with the call, and the Next.js server runs it inside the user's own
authenticated request — through the same executors, authorization and domain
services as before — and sends the outcome back in the next step. Python
therefore holds no credentials and has no path to any data; it sees only what
those tools return.

Steps and what the caller does with each:

    execute  -> emit tool-start, run the tool, emit tool-end, resume with the outcome
    compose  -> emit composing, resume with nothing (the model is called next)
    final    -> the reviewed answer
    error    -> a provider, agent or configuration failure, by code

Everything the turn needs between steps travels in a sealed state
(`app.security.state_seal`). The rules carried over unchanged and are pinned by
`tests/fixtures/golden.json` and `tests/test_agent.py`: bounded calls and iterations, one planner
proposal and three drafts per reply, the grounding retry, figure containment and
the write-claim guard.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Callable

from app.config import Limits, ProviderSettings
from app.guards.figure_containment import check_figure_containment, describe_containment_failure
from app.guards.write_claims import review_write_claims
from app.orchestration import instruction as inst
from app.orchestration.text import bounded_tool_result, safe_text, utf16_slice
from app.providers.base import Provider, ProviderError, ProviderResponse, ToolResult
from app.tools.catalog import ToolDeclaration, arguments_have_valid_shape, catalog, tools_for

log = logging.getLogger("michael.agent")

PROPOSAL_TOOL = "prepare_schedule_proposal"


class AgentError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass
class StepContext:
    provider: Provider
    settings: ProviderSettings
    limits: Limits
    now_ms: Callable[[], int] = lambda: int(time.time() * 1000)


def _new_turn() -> dict[str, Any]:
    return {
        "activity": [], "seen": [], "draftKinds": [], "proposals": 0,
        "totalCalls": 0, "iteration": 0,
        "continuation": None, "usage": None,
        "pending": [], "cursor": 0, "results": [], "awaiting": None,
    }


def _declarations(state: dict[str, Any]) -> list[ToolDeclaration]:
    known = catalog()
    return [known[name] for name in state["allowedTools"]]


def _system(state: dict[str, Any]) -> str:
    return inst.system_instruction(state["product"], state["today"], state.get("timeZone"), state.get("displayName"))


def _remaining_s(state: dict[str, Any], ctx: StepContext) -> float:
    return max(0.0, (state["deadline"] - ctx.now_ms()) / 1000)


def _remaining_ms(state: dict[str, Any], ctx: StepContext) -> int:
    return max(0, state["deadline"] - ctx.now_ms())


def _expired(state: dict[str, Any], ctx: StepContext) -> bool:
    return ctx.now_ms() >= state["deadline"]


def _with_note(messages: list[dict[str, str]], note: str, user_only: bool) -> list[dict[str, str]]:
    if not messages or (user_only and messages[-1]["role"] != "user"):
        return messages
    last = messages[-1]
    return [*messages[:-1], {"role": last["role"], "content": f"{last['content']}\n\n{note}"}]


def _final(message: str, activity: list[dict[str, str]], payload_attempt: int | None, usage: dict[str, int] | None = None) -> dict[str, Any]:
    response: dict[str, Any] = {"action": "final", "message": message, "toolActivity": activity, "payloadAttempt": payload_attempt}
    if usage:
        response["usage"] = usage
    return response


async def _call_model(state: dict[str, Any], ctx: StepContext, call: Callable[[float], Any]) -> ProviderResponse:
    """A provider call bounded by the turn's deadline; a failure after it is a timeout."""
    if _expired(state, ctx):
        raise AgentError("REQUEST_TIMEOUT")
    try:
        return await call(_remaining_s(state, ctx))
    except Exception:
        if _expired(state, ctx):
            raise AgentError("REQUEST_TIMEOUT") from None
        raise


async def start(state: dict[str, Any], ctx: StepContext) -> dict[str, Any]:
    """Begin attempt 1. `state` was built by `new_state`."""
    first = _with_note(state["messages"], inst.FRESH_DATA_NOTE, user_only=True)
    response = await _call_model(state, ctx, lambda timeout: ctx.provider.generate(
        model=ctx.settings.model, system_instruction=_system(state), messages=first,
        tools=[d.for_model() for d in _declarations(state)], timeout_s=timeout))
    return await _advance(state, response, ctx)


def new_state(*, product: str, time_zone: str | None, display_name: str | None, allowed_tools: list[str], messages: list[dict[str, str]], correlation_id: str, ctx: StepContext) -> dict[str, Any]:
    tools_for(product, allowed_tools)  # refuses a name outside the product
    started = ctx.now_ms()
    return {
        "v": 1, "correlationId": correlation_id, "provider": ctx.settings.provider, "model": ctx.settings.model,
        "product": product, "timeZone": time_zone, "displayName": display_name,
        "today": inst.local_today(time_zone), "allowedTools": list(dict.fromkeys(allowed_tools)),
        "limits": {"maxToolCalls": ctx.limits.max_tool_calls, "maxIterations": ctx.limits.max_iterations, "maxOutputChars": ctx.limits.max_output_chars, "timeoutMs": ctx.limits.timeout_ms},
        "startedAt": started, "deadline": started + ctx.limits.timeout_ms,
        "messages": messages,
        # What the user said may be repeated back; Michael's own earlier replies may not.
        "userStated": [m["content"] for m in messages if m["role"] == "user"],
        "attempt": 1, "firstActivity": None, "turn": _new_turn(), "phase": "model",
    }


async def _advance(state: dict[str, Any], response: ProviderResponse, ctx: StepContext) -> dict[str, Any]:
    turn = state["turn"]
    turn["continuation"] = response.continuation
    turn["usage"] = response.usage
    if not response.tool_calls:
        return await _finish_turn(state, response.text, ctx, limited=False)
    limits = state["limits"]
    if turn["iteration"] >= limits["maxIterations"] or turn["totalCalls"] >= limits["maxToolCalls"]:
        return await _finish_turn(state, "", ctx, limited=True)
    calls = response.tool_calls[: limits["maxToolCalls"] - turn["totalCalls"]]
    if len(calls) != len(response.tool_calls):
        return await _finish_turn(state, "", ctx, limited=True)
    turn["pending"] = [{"id": call.id, "name": call.name, "arguments": call.arguments} for call in calls]
    turn["cursor"] = 0
    turn["results"] = []
    return _next_call(state, ctx)


def _refuse(turn: dict[str, Any], call: dict[str, Any], status: str, error: str, activity_name: str) -> None:
    turn["activity"].append({"name": activity_name, "status": status})
    turn["results"].append({"callId": call["id"], "name": call["name"], "result": {"error": error}, "isError": True})


def _next_call(state: dict[str, Any], ctx: StepContext) -> dict[str, Any]:
    turn = state["turn"]
    allowed = {d.name: d for d in _declarations(state)}
    while turn["cursor"] < len(turn["pending"]):
        call = turn["pending"][turn["cursor"]]
        turn["cursor"] += 1
        turn["totalCalls"] += 1
        declaration = allowed.get(call["name"])
        if declaration is None:
            _refuse(turn, call, "unavailable", "Tool is not available in this context.", utf16_slice(call["name"], 80))
            continue
        # Drafts are separate payloads, so the one-proposal rule counts only planner proposals.
        if call["name"] == PROPOSAL_TOOL and turn["proposals"] > 0:
            _refuse(turn, call, "failed", "Only one schedule proposal can be prepared in a reply.", declaration.name)
            continue
        if call["name"].startswith("draft_") and len(turn["draftKinds"]) >= inst.MAX_DRAFTS_PER_REPLY:
            _refuse(turn, call, "failed", f"Only {inst.MAX_DRAFTS_PER_REPLY} drafts can be prepared in one reply. Ask the user to save these first.", declaration.name)
            continue
        if not arguments_have_valid_shape(declaration, call["arguments"]):
            _refuse(turn, call, "failed", "Tool arguments were invalid.", declaration.name)
            continue
        turn["awaiting"] = {"id": call["id"], "name": declaration.name}
        state["phase"] = "tool"
        # Time left rather than a clock reading, so the two servers' clocks need not agree.
        return {"action": "execute", "call": {"id": call["id"], "name": declaration.name, "arguments": call["arguments"]}, "attempt": state["attempt"], "remainingMs": _remaining_ms(state, ctx), "state": state}
    if turn["continuation"] is None:
        raise AgentError("INVALID_MODEL_RESPONSE")
    state["phase"] = "compose"
    return {"action": "compose", "remainingMs": _remaining_ms(state, ctx), "state": state}


def record_outcome(state: dict[str, Any], outcome: dict[str, Any], ctx: StepContext) -> dict[str, Any]:
    """The server ran (or refused) the awaited call; record it and pick the next one."""
    if _expired(state, ctx):
        raise AgentError("REQUEST_TIMEOUT")
    turn = state["turn"]
    awaiting = turn["awaiting"]
    if state["phase"] != "tool" or awaiting is None or outcome["callId"] != awaiting["id"]:
        raise AgentError("INVALID_STATE")
    turn["awaiting"] = None
    call = {"id": awaiting["id"], "name": awaiting["name"]}
    status = outcome["status"]
    if status == "completed":
        payload = outcome.get("clientPayload")
        if payload is not None:
            if payload["kind"] == "draft":
                turn["draftKinds"].append(payload["draftKind"])
                turn["seen"].append(payload.get("draft"))
            else:
                turn["proposals"] += 1
        bounded = bounded_tool_result(outcome.get("modelResult"))
        turn["activity"].append({"name": call["name"], "status": "completed"})
        turn["seen"].append(bounded)
        turn["results"].append({"callId": call["id"], "name": call["name"], "result": bounded})
    elif status == "invalid_arguments":
        _refuse(turn, call, "failed", "Tool arguments were invalid.", call["name"])
    elif status == "unavailable":
        _refuse(turn, call, "unavailable", "Tool is not available in this context.", call["name"])
    else:
        _refuse(turn, call, "failed", "This information is currently unavailable.", call["name"])
    return _next_call(state, ctx)


async def compose(state: dict[str, Any], ctx: StepContext) -> dict[str, Any]:
    if state["phase"] != "compose":
        raise AgentError("INVALID_STATE")
    turn = state["turn"]
    results = [ToolResult(r["callId"], r["name"], r["result"], r.get("isError", False)) for r in turn["results"]]
    turn["iteration"] += 1
    response = await _call_model(state, ctx, lambda timeout: ctx.provider.continue_with_tools(
        model=ctx.settings.model, system_instruction=_system(state), tools=[d.for_model() for d in _declarations(state)],
        continuation=turn["continuation"], results=results, timeout_s=timeout))
    state["phase"] = "model"
    return await _advance(state, response, ctx)


def _user_stated(state: dict[str, Any]) -> list[Any]:
    return [state["today"], *state["userStated"]]


async def _finish_turn(state: dict[str, Any], raw_text: str, ctx: StepContext, *, limited: bool) -> dict[str, Any]:
    turn = state["turn"]
    max_chars = state["limits"]["maxOutputChars"]
    if state["attempt"] == 1:
        if limited:
            return _final(inst.LOOKUP_LIMIT, turn["activity"], 1)
        if _expired(state, ctx):
            raise AgentError("REQUEST_TIMEOUT")
        text = safe_text(raw_text, max_chars)
        if not text:
            raise AgentError("INVALID_MODEL_RESPONSE")
        containment = check_figure_containment(text, [*turn["seen"], *_user_stated(state)])
        if containment.contained:
            review = review_write_claims(text, turn["draftKinds"])
            if review.corrected:
                log.warning("[ai-agent] Replaced a false claim that a record had been saved.")
            return _final(review.message, turn["activity"], 1, turn["usage"])
        # A retry is a whole second turn: only worth it with most of the budget left.
        if ctx.now_ms() - state["startedAt"] > state["limits"]["timeoutMs"] * inst.RETRY_BUDGET_FRACTION:
            log.warning("[ai-agent] Withheld a reply with unsupported figures; no time to retry. %s", describe_containment_failure(containment))
            return _final(inst.ungrounded_reply(state["product"]), turn["activity"], None)
        log.warning("[ai-agent] Retrying a reply with unsupported figures. %s", describe_containment_failure(containment))
        state["firstActivity"] = turn["activity"]
        state["attempt"] = 2
        state["turn"] = _new_turn()
        retry = _with_note(state["messages"], inst.GROUNDING_RETRY_NOTE, user_only=False)
        response = await _call_model(state, ctx, lambda timeout: ctx.provider.generate(
            model=ctx.settings.model, system_instruction=_system(state), messages=retry,
            tools=[d.for_model() for d in _declarations(state)], timeout_s=timeout))
        return await _advance(state, response, ctx)
    # The retry turn has finished.
    if _expired(state, ctx):
        raise AgentError("REQUEST_TIMEOUT")
    text = "" if limited else safe_text(raw_text, max_chars)
    if text and check_figure_containment(text, [*turn["seen"], *_user_stated(state)]).contained:
        review = review_write_claims(text, turn["draftKinds"])
        if review.corrected:
            log.warning("[ai-agent] Replaced a false claim that a record had been saved.")
        return _final(review.message, turn["activity"], 2, turn["usage"])
    log.warning("[ai-agent] Withheld a reply whose figures no tool result supports.")
    return _final(inst.ungrounded_reply(state["product"]), state["firstActivity"] or [], None)


async def run_step(state: dict[str, Any], ctx: StepContext, outcome: dict[str, Any] | None) -> dict[str, Any]:
    """Dispatch one resumed step. Provider failures surface as ProviderError, agent ones as AgentError."""
    if state["provider"] != ctx.settings.provider or state["model"] != ctx.settings.model:
        raise AgentError("INVALID_STATE")
    if state["phase"] == "tool":
        if outcome is None:
            raise AgentError("INVALID_STATE")
        return record_outcome(state, outcome, ctx)
    if state["phase"] == "compose":
        if outcome is not None:
            raise AgentError("INVALID_STATE")
        return await compose(state, ctx)
    raise AgentError("INVALID_STATE")


__all__ = ["AgentError", "ProviderError", "StepContext", "new_state", "start", "run_step"]
