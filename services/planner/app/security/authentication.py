from __future__ import annotations

import hmac

from fastapi import Header, HTTPException, status

from app.config import get_settings


def require_planner_token(authorization: str | None = Header(default=None)) -> None:
    configured = get_settings().planner_service_token
    if len(configured) < 32:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail={"error": "PLANNER_NOT_CONFIGURED", "message": "Planning service authentication is not configured."})
    if authorization is None or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "UNAUTHORIZED", "message": "Valid bearer authentication is required."}, headers={"WWW-Authenticate": "Bearer"})
    supplied = authorization.removeprefix("Bearer ")
    if not hmac.compare_digest(supplied, configured):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "UNAUTHORIZED", "message": "Valid bearer authentication is required."}, headers={"WWW-Authenticate": "Bearer"})
