"""
Rate limiting — proxy-aware client keys, Redis-backed counters, tiered limits.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from fastapi import Request
from fastapi.responses import JSONResponse
from jose import JWTError, jwt
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from backend.config import settings

logger = logging.getLogger(__name__)

_TRUSTED_PROXY = os.getenv("TRUSTED_PROXY", "1").lower() in ("1", "true", "yes")


def get_client_address(request: Request) -> str:
    """Resolve the real client IP behind Docker / reverse-proxy hops."""
    if _TRUSTED_PROXY:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip.strip()
    if request.client and request.client.host:
        return request.client.host
    return get_remote_address(request)


def _username_from_bearer(request: Request) -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    if not token or not settings.SECRET_KEY:
        return None
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        return payload.get("sub")
    except JWTError:
        return None


def api_rate_key(request: Request) -> str:
    """General API bucket: per authenticated user, else per client IP."""
    username = _username_from_bearer(request)
    if username:
        return f"api:user:{username}"
    return f"api:ip:{get_client_address(request)}"


def polling_rate_key(request: Request) -> str:
    """Status polling bucket: per user (or IP) + survey — avoids Docker IP collapse."""
    survey_id = request.path_params.get("survey_id", "_")
    username = _username_from_bearer(request)
    if username:
        return f"poll:user:{username}:{survey_id}"
    client = get_client_address(request)
    return f"poll:ip:{client}:{survey_id}"


def _storage_uri() -> str:
    uri = settings.REDIS_URL
    if uri and uri.startswith("redis"):
        return uri
    return "memory://"


limiter = Limiter(
    key_func=api_rate_key,
    default_limits=["500 per hour", "3000 per day"],
    storage_uri=_storage_uri(),
    headers_enabled=True,
)

POLLING_LIMIT = "1200 per hour; 8000 per day"


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """429 with Retry-After so clients back off instead of hammering."""
    base = _rate_limit_exceeded_handler(request, exc)
    retry_after = getattr(exc, "retry_after", None) or 30
    if hasattr(base, "headers"):
        base.headers["Retry-After"] = str(int(retry_after))
    return base
