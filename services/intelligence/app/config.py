"""Configuration, read from the environment on every call so tests can patch it.

The provider settings use the same variable names as the Next.js server's
`src/lib/ai/config.ts`, and the same refusals: no local model and no Gemini
unpaid tier in production. Loop limits are owned here, because the loop is.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Literal

ProviderName = Literal["gemini", "ollama"]


class ConfigurationError(Exception):
    """Carries a code the Next.js route already maps to a user-facing message."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Limits:
    max_tool_calls: int
    max_iterations: int
    timeout_ms: int
    max_output_chars: int


@dataclass(frozen=True)
class ProviderSettings:
    provider: ProviderName
    model: str
    data_tier: Literal["paid", "unpaid"]
    api_key: str | None = None
    base_url: str | None = None


def service_token() -> str:
    return os.environ.get("INTELLIGENCE_SERVICE_TOKEN", "")


def is_production() -> bool:
    return os.environ.get("INTELLIGENCE_ENV", "development") == "production"


def _bounded(name: str, fallback: int, low: int, high: int) -> int:
    raw = os.environ.get(name, "")
    if raw == "":
        return fallback
    try:
        value = int(raw)
    except ValueError as error:
        raise ConfigurationError("AI_CONFIGURATION_ERROR") from error
    if value < low or value > high:
        raise ConfigurationError("AI_CONFIGURATION_ERROR")
    return value


def provider_settings() -> ProviderSettings:
    provider = os.environ.get("AI_PROVIDER", "gemini")
    if provider == "ollama":
        if is_production():
            raise ConfigurationError("AI_LOCAL_PROVIDER_NOT_FOR_PRODUCTION")
        base_url = (os.environ.get("OLLAMA_BASE_URL") or "http://127.0.0.1:11434").rstrip("/")
        if not base_url.startswith(("http://", "https://")):
            raise ConfigurationError("AI_PROVIDER_UNAVAILABLE")
        # Nothing leaves the machine, so the unpaid-tier guard does not apply.
        return ProviderSettings(provider="ollama", model=os.environ.get("OLLAMA_MODEL") or "qwen2.5", data_tier="paid", base_url=base_url)
    if provider != "gemini":
        raise ConfigurationError("AI_CONFIGURATION_ERROR")
    data_tier: Literal["paid", "unpaid"] = "paid" if os.environ.get("GEMINI_DATA_TIER") == "paid" else "unpaid"
    api_key = os.environ.get("GEMINI_API_KEY") or None
    if not api_key:
        raise ConfigurationError("AI_PROVIDER_UNAVAILABLE")
    if is_production() and data_tier != "paid":
        raise ConfigurationError("AI_UNPAID_TIER_DISABLED")
    return ProviderSettings(
        provider="gemini",
        model=os.environ.get("GEMINI_MODEL") or "gemini-3.8-flash",
        data_tier=data_tier,
        api_key=api_key,
        base_url=(os.environ.get("GEMINI_BASE_URL") or "https://generativelanguage.googleapis.com").rstrip("/"),
    )


def limits(provider: ProviderName) -> Limits:
    # A local model is slower, so it may be given longer, as in the TS config.
    return Limits(
        max_tool_calls=_bounded("AI_MAX_TOOL_CALLS", 5, 1, 10),
        max_iterations=_bounded("AI_MAX_ITERATIONS", 4, 1, 6),
        timeout_ms=_bounded("AI_REQUEST_TIMEOUT_MS", 30_000, 2_000, 120_000 if provider == "ollama" else 60_000),
        max_output_chars=_bounded("AI_MAX_OUTPUT_CHARS", 6_000, 500, 10_000),
    )
