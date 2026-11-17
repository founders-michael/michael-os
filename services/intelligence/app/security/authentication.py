from __future__ import annotations

import hmac

from fastapi import Header, HTTPException, status

from app.config import service_token

MIN_TOKEN_LENGTH = 32


def require_service_token(authorization: str | None = Header(default=None)) -> None:
    """Only the Next.js server may call this service. Fails closed when unconfigured."""
    configured = service_token()
    if len(configured) < MIN_TOKEN_LENGTH:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail={"error": "INTELLIGENCE_NOT_CONFIGURED", "message": "Intelligence service authentication is not configured."})
    if authorization is None or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "UNAUTHORIZED", "message": "Valid bearer authentication is required."}, headers={"WWW-Authenticate": "Bearer"})
    if not hmac.compare_digest(authorization.removeprefix("Bearer ").encode(), configured.encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "UNAUTHORIZED", "message": "Valid bearer authentication is required."}, headers={"WWW-Authenticate": "Bearer"})
