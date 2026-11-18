from __future__ import annotations

import logging
from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException

from app.api.models import ClassifyRequest, MemorySelectRequest, PrioritizeRequest, StepRequest
from app.config import ConfigurationError, limits, provider_settings, service_token
from app.orchestration import agent
from app.providers.base import Provider, ProviderError
from app.providers.factory import create_provider
from app.security.authentication import MIN_TOKEN_LENGTH, require_service_token
from app.security.state_seal import StateError, seal, unseal
from app.memory.selection import select as select_memories
from app.tasks.classification import suggest_category
from app.tasks.prioritization import prioritize
from app.tools.catalog import CatalogError, catalog

router = APIRouter()
log = logging.getLogger("michael.api")

# Replaced in tests with a scripted model; production always builds from settings.
provider_factory: Callable[..., Provider] = create_provider


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
def ready() -> dict[str, Any]:
    checks: dict[str, Any] = {"authentication": len(service_token()) >= MIN_TOKEN_LENGTH}
    try:
        checks["tools"] = len(catalog())
    except (OSError, ValueError, CatalogError):
        checks["tools"] = 0
    try:
        settings = provider_settings()
        checks["provider"] = settings.provider
    except ConfigurationError as error:
        checks["provider"] = None
        checks["providerError"] = error.code
    ok = checks["authentication"] and checks["tools"] > 0 and checks["provider"] is not None
    if not ok:
        raise HTTPException(status_code=503, detail={"status": "not_ready", **checks})
    return {"status": "ready", **checks}


def _error(kind: str, code: str) -> dict[str, str]:
    return {"action": "error", "kind": kind, "code": code}


def _sealed(response: dict[str, Any]) -> dict[str, Any]:
    if "state" in response:
        response = {**response, "state": seal(response["state"])}
    return response


@router.post("/v1/agent/step", dependencies=[Depends(require_service_token)])
async def step(request: StepRequest) -> dict[str, Any]:
    try:
        settings = provider_settings()
        ctx = agent.StepContext(provider=provider_factory(settings), settings=settings, limits=limits(settings.provider))
    except ConfigurationError as error:
        return _error("configuration", error.code)
    except ProviderError as error:
        return _error("provider", error.code)

    try:
        if request.start is not None:
            start = request.start
            # Refuse before any data reaches a model the user was not told about.
            if start.expectedProvider != settings.provider:
                return _error("configuration", "AI_PROVIDER_MISMATCH")
            if settings.data_tier == "unpaid" and not start.dataUseAcknowledged:
                return _error("configuration", "DATA_USE_ACKNOWLEDGEMENT_REQUIRED")
            try:
                state = agent.new_state(
                    product=start.product, time_zone=start.timeZone, display_name=start.displayName,
                    allowed_tools=start.allowedTools, messages=[m.model_dump() for m in start.messages],
                    correlation_id=request.correlationId, ctx=ctx)
            except CatalogError as error:
                raise HTTPException(status_code=400, detail={"error": "TOOL_SCOPE_INVALID", "message": "A requested tool is outside this product."}) from error
            return _sealed(await agent.start(state, ctx))
        resume = request.resume
        assert resume is not None
        try:
            state = unseal(resume.state)
        except StateError as error:
            raise HTTPException(status_code=400, detail={"error": "STATE_INVALID", "message": "The turn state was not issued by this service."}) from error
        if state.get("correlationId") != request.correlationId:
            raise HTTPException(status_code=400, detail={"error": "STATE_INVALID", "message": "The turn state belongs to another request."})
        outcome = resume.outcome.model_dump(exclude_none=False) if resume.outcome else None
        if outcome and outcome.get("clientPayload") is None:
            outcome.pop("clientPayload", None)
        return _sealed(await agent.run_step(state, ctx, outcome))
    except ProviderError as error:
        return _error("provider", error.code)
    except agent.AgentError as error:
        if error.code == "INVALID_STATE":
            raise HTTPException(status_code=409, detail={"error": "STATE_INVALID", "message": "That step does not fit the turn's state."}) from error
        return _error("agent", error.code)


@router.post("/v1/tasks/prioritize", dependencies=[Depends(require_service_token)])
def prioritize_tasks(request: PrioritizeRequest) -> dict[str, Any]:
    """Deterministic: no model, no provider configuration needed."""
    return {"schemaVersion": 1, **prioritize(request.signals, request.asOfDate)}


@router.post("/v1/memory/select", dependencies=[Depends(require_service_token)])
def select_memory(request: MemorySelectRequest) -> dict[str, Any]:
    """Deterministic ranking of one scope's memories for a question: no model, no provider needed."""
    items = [item.model_dump() for item in request.items]
    return {"schemaVersion": 1, **select_memories(request.query, items, request.limit)}


@router.post("/v1/tasks/classify", dependencies=[Depends(require_service_token)])
async def classify_task(request: ClassifyRequest) -> dict[str, Any]:
    """One category suggestion for one task, chosen only from the registry."""
    try:
        settings = provider_settings()
        provider = provider_factory(settings)
    except ConfigurationError as error:
        return _error("configuration", error.code)
    except ProviderError as error:
        return _error("provider", error.code)
    # Refuse before any record reaches a model the user was not told about.
    if request.expectedProvider != settings.provider:
        return _error("configuration", "AI_PROVIDER_MISMATCH")
    if settings.data_tier == "unpaid" and not request.dataUseAcknowledged:
        return _error("configuration", "DATA_USE_ACKNOWLEDGEMENT_REQUIRED")
    try:
        suggestion = await suggest_category(
            provider=provider, provider_name=settings.provider, model=settings.model, product=request.product,
            title=request.record.title, description=request.record.description,
            timeout_s=limits(settings.provider).timeout_ms / 1000,
        )
    except ProviderError as error:
        return _error("provider", error.code)
    return {
        "action": "suggestion",
        "categoryKey": suggestion.category_key,
        "confidence": suggestion.confidence,
        "sourceRef": suggestion.source_ref,
    }
