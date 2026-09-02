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


#: JWT subjects that are a token *class*, not a person. Their `sub` is a
#: constant shared by every holder, so bucketing on it would put every share
#: viewer (or every capture worker) into one counter and let a single busy
#: client 429 everyone else. Each needs a key drawn from its own claims.
_SERVICE_SUBJECT_KEY_CLAIM = {
    "report-viewer": "share_id",
    "pptx-capture": "survey_id",
}


def _payload_from_bearer(request: Request) -> Optional[dict]:
    auth = request.headers.get("Authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    if not token or not settings.SECRET_KEY:
        return None
    try:
        return jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_aud": False},
        )
    except JWTError:
        return None


def _username_from_bearer(request: Request) -> Optional[str]:
    payload = _payload_from_bearer(request)
    return payload.get("sub") if payload else None


def _principal_key(request: Request) -> Optional[str]:
    """
    Identify the caller for rate-limiting: a user by name, a service token by
    the claim that distinguishes one holder from another.
    """
    payload = _payload_from_bearer(request)
    if not payload:
        return None

    sub = payload.get("sub")
    if not sub:
        return None

    claim = _SERVICE_SUBJECT_KEY_CLAIM.get(sub)
    if claim:
        scoped = str(payload.get(claim) or "").strip()
        # Fall back to the IP rather than the shared subject — an unusable
        # claim must not silently collapse every holder into one bucket.
        if not scoped:
            return None
        return f"{sub}:{scoped}"

    return f"user:{sub}"


def api_rate_key(request: Request) -> str:
    """General API bucket: per authenticated principal, else per client IP."""
    principal = _principal_key(request)
    if principal:
        return f"api:{principal}"
    return f"api:ip:{get_client_address(request)}"


def polling_rate_key(request: Request) -> str:
    """Status polling bucket: per principal (or IP) + survey — avoids Docker IP collapse."""
    survey_id = request.path_params.get("survey_id", "_")
    principal = _principal_key(request)
    if principal:
        return f"poll:{principal}:{survey_id}"
    client = get_client_address(request)
    return f"poll:ip:{client}:{survey_id}"


def share_unlock_rate_key(request: Request) -> str:
    """
    Unlock attempts, per client IP.

    slowapi resolves the key before the request body is parsed, so the share
    token itself is not available here. Per-link throttling is enforced in the
    handler via the lockout counters on the share document — which is also the
    control that survives a spoofed X-Forwarded-For or a distributed attempt.
    """
    return f"share:unlock:{get_client_address(request)}"


def share_view_rate_key(request: Request) -> str:
    """Shared-report reads, bucketed per share link."""
    principal = _principal_key(request)
    if principal:
        return f"share:view:{principal}"
    return f"share:view:ip:{get_client_address(request)}"


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

#: Report share links. Unlock is the brute-force surface, so it is tight; the
#: read limit only needs to stop a runaway client, since a viewer session is
#: already bounded by the share's own expiry and view cap.
SHARE_UNLOCK_LIMIT = "10 per hour; 40 per day"
SHARE_VIEW_LIMIT = "240 per hour"
SHARE_PPTX_LIMIT = "1 per hour; 6 per day"


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """429 with Retry-After so clients back off instead of hammering."""
    base = _rate_limit_exceeded_handler(request, exc)
    retry_after = getattr(exc, "retry_after", None) or 30
    if hasattr(base, "headers"):
        base.headers["Retry-After"] = str(int(retry_after))
    return base
