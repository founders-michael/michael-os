"""The single place a provider is chosen."""
from __future__ import annotations

from app.config import ProviderSettings
from app.providers.base import Provider
from app.providers.gemini import GeminiProvider
from app.providers.ollama import OllamaProvider


def create_provider(settings: ProviderSettings) -> Provider:
    if settings.provider == "ollama":
        return OllamaProvider(settings.base_url or "http://127.0.0.1:11434")
    return GeminiProvider(settings.api_key or "", settings.base_url or "https://generativelanguage.googleapis.com")
