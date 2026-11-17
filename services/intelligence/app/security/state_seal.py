"""Seals the turn state the Next.js server carries between steps.

The service keeps nothing between requests: each step returns the whole turn
state and the next step sends it back. The state holds what the model has been
shown and which tool call is outstanding, so it is compressed and signed with a
key derived from the service token; a modified or foreign state is refused
rather than trusted. It expires with the turn's own deadline.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import zlib
from typing import Any

from app.config import service_token

_LABEL = b"michaelos:intelligence-turn-state:v1"
# Checked after signature verification, as a second bound on what is inflated.
MAX_STATE_BYTES = 8 * 1024 * 1024


class StateError(Exception):
    pass


def _key() -> bytes:
    token = service_token()
    if not token:
        raise StateError("unconfigured")
    return hmac.new(token.encode(), _LABEL, hashlib.sha256).digest()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def seal(state: dict[str, Any]) -> str:
    payload = _b64(zlib.compress(json.dumps(state, ensure_ascii=False, separators=(",", ":")).encode("utf-8", "surrogatepass")))
    signature = _b64(hmac.new(_key(), payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{signature}"


def unseal(sealed: str) -> dict[str, Any]:
    payload, _, signature = sealed.partition(".")
    if not payload or not signature:
        raise StateError("malformed")
    expected = _b64(hmac.new(_key(), payload.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(expected.encode(), signature.encode()):
        raise StateError("signature")
    try:
        inflater = zlib.decompressobj()
        raw = inflater.decompress(_unb64(payload), MAX_STATE_BYTES)
        if inflater.unconsumed_tail:
            raise StateError("too_large")
        state = json.loads(raw.decode("utf-8", "surrogatepass"))
    except (ValueError, zlib.error) as error:
        raise StateError("malformed") from error
    if not isinstance(state, dict) or state.get("v") != 1:
        raise StateError("version")
    return state
