"""
Short-lived JWTs for PIN-unlocked report share links.

A viewer token is minted only after someone proves they hold both factors of a
share link — the opaque URL token *and* the PIN the analyst sent separately.
It then stands in for those credentials for the next half hour so the client
reads the report without re-typing anything.

Three properties do the security work, and all three are claims, not checks a
route has to remember to perform:

  * ``survey_id`` lives in the token. The shared endpoints take no survey path
    parameter at all, so there is nothing to tamper with and no way to walk to
    another survey's report.
  * ``sub`` is a reserved subject that :mod:`backend.routers.capture_auth_deps`
    refuses, so a viewer token can never satisfy a normal user dependency.
  * ``pv`` pins the PIN generation. Regenerating a link's PIN invalidates every
    live session for it without maintaining a revocation list.

Possessing a valid token is still not sufficient authority — the share document
is re-read on every request (see ``share_viewer_deps``) so revoking a link
takes effect immediately rather than whenever the token happens to expire.

This mirrors ``pptx_builder.hybrid_export.capture_auth`` deliberately: same
claim-contract constants, same frozen claims dataclass, same error taxonomy.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Sequence, Tuple

from jose import JWTError, jwt

from backend.config import settings

# Claim contract — must stay stable across API, frontend, and tests.
VIEWER_TOKEN_SUBJECT = "report-viewer"
VIEWER_TOKEN_PURPOSE = "report_share_view"
VIEWER_TOKEN_AUDIENCE = "report-share-viewer"

SCOPE_READ = "report:read"
SCOPE_DOWNLOAD = "report:download"
ALLOWED_SCOPES = frozenset({SCOPE_READ, SCOPE_DOWNLOAD})

# Error codes, aligned with the capture-token taxonomy.
CODE_VIEWER_AUTH_INVALID = "share_auth_invalid"
CODE_VIEWER_AUTH_EXPIRED = "share_auth_expired"
CODE_VIEWER_AUTH_SCOPE = "share_auth_scope"
CODE_VIEWER_AUTH_CONFIG = "share_auth_config"

# TTL bounds. The configured value is a preference, not a licence to mint a
# token that outlives the reason it exists.
_MIN_TTL_MINUTES = 5
_MAX_TTL_MINUTES = 60


class ShareAuthError(Exception):
    """Base error for viewer-token minting or validation."""

    def __init__(
        self,
        message: str,
        *,
        code: str = CODE_VIEWER_AUTH_INVALID,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.code = code
        self.details = details or {}


class ShareTokenExpiredError(ShareAuthError):
    def __init__(self, message: str = "Report viewer session has expired"):
        super().__init__(message, code=CODE_VIEWER_AUTH_EXPIRED)


class ShareTokenInvalidError(ShareAuthError):
    pass


class ShareTokenScopeError(ShareAuthError):
    def __init__(self, message: str = "Report viewer session lacks the required scope"):
        super().__init__(message, code=CODE_VIEWER_AUTH_SCOPE)


@dataclass(frozen=True)
class ViewerTokenClaims:
    """Validated claims extracted from a report viewer JWT."""

    subject: str
    purpose: str
    share_id: str
    survey_id: str
    scope: Tuple[str, ...]
    pin_version: int
    viewer_id: str
    session_started_at: datetime
    jti: str
    expires_at: Optional[datetime] = None

    def has_scope(self, scope: str) -> bool:
        return scope in self.scope

    def as_dict(self) -> Dict[str, Any]:
        return {
            "sub": self.subject,
            "purpose": self.purpose,
            "share_id": self.share_id,
            "survey_id": self.survey_id,
            "scope": list(self.scope),
            "pv": self.pin_version,
            "viewer_id": self.viewer_id,
            "sid": int(self.session_started_at.timestamp()),
            "jti": self.jti,
            "exp": self.expires_at.isoformat() if self.expires_at else None,
        }


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _require_secret_key() -> str:
    key = (settings.SECRET_KEY or "").strip()
    if not key:
        raise ShareAuthError(
            "SECRET_KEY is not configured; cannot mint report viewer tokens.",
            code=CODE_VIEWER_AUTH_CONFIG,
        )
    return key


def viewer_ttl_minutes() -> int:
    """Configured session TTL, clamped to a sane band."""
    try:
        raw = int(settings.REPORT_SHARE_VIEWER_TTL_MINUTES)
    except (TypeError, ValueError):
        raw = 30
    return max(_MIN_TTL_MINUTES, min(_MAX_TTL_MINUTES, raw))


def session_max_hours() -> int:
    try:
        raw = int(settings.REPORT_SHARE_SESSION_MAX_HOURS)
    except (TypeError, ValueError):
        raw = 8
    return max(1, min(24, raw))


def _normalize_scope(scope: Sequence[str]) -> Tuple[str, ...]:
    resolved = tuple(
        s for s in dict.fromkeys(str(x).strip() for x in (scope or ())) if s in ALLOWED_SCOPES
    )
    if SCOPE_READ not in resolved:
        # Read access is what a viewer token *is*; a token without it would be
        # a credential that opens nothing.
        raise ShareAuthError(
            f"Viewer scope must include {SCOPE_READ!r}; got {list(scope)!r}.",
            code=CODE_VIEWER_AUTH_SCOPE,
        )
    return resolved


def scopes_for_share(allow_download: bool) -> Tuple[str, ...]:
    """Translate a share's download toggle into the token's scope list."""
    return (SCOPE_READ, SCOPE_DOWNLOAD) if allow_download else (SCOPE_READ,)


def create_viewer_access_token(
    *,
    share_id: str,
    survey_id: str,
    scope: Sequence[str],
    pin_version: int,
    viewer_id: str,
    session_started_at: Optional[datetime] = None,
    expires_minutes: Optional[int] = None,
) -> Tuple[str, datetime]:
    """
    Mint a viewer session token. Returns ``(jwt, expires_at)``.

    ``session_started_at`` is carried forward across refreshes so the absolute
    session cap is measured from the original unlock, not the last refresh —
    otherwise a page left open would renew itself indefinitely.
    """
    resolved_share = str(share_id or "").strip()
    resolved_survey = str(survey_id or "").strip()
    if not resolved_share or not resolved_survey:
        raise ShareAuthError(
            "share_id and survey_id are required to mint a viewer token.",
            code=CODE_VIEWER_AUTH_INVALID,
        )

    resolved_scope = _normalize_scope(scope)
    started = session_started_at or _utc_now()
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)

    ttl = expires_minutes if expires_minutes is not None else viewer_ttl_minutes()
    ttl = max(_MIN_TTL_MINUTES, min(_MAX_TTL_MINUTES, int(ttl)))
    expire = _utc_now() + timedelta(minutes=ttl)

    # Never let a refresh push a session past its absolute cap.
    hard_stop = started + timedelta(hours=session_max_hours())
    if expire > hard_stop:
        expire = hard_stop
    if expire <= _utc_now():
        raise ShareTokenExpiredError(
            "Report viewer session has reached its maximum duration.",
        )

    payload: Dict[str, Any] = {
        "sub": VIEWER_TOKEN_SUBJECT,
        "purpose": VIEWER_TOKEN_PURPOSE,
        "aud": VIEWER_TOKEN_AUDIENCE,
        "share_id": resolved_share,
        "survey_id": resolved_survey,
        "scope": list(resolved_scope),
        "pv": int(pin_version),
        "viewer_id": str(viewer_id or "").strip() or str(uuid.uuid4()),
        "sid": int(started.timestamp()),
        "jti": str(uuid.uuid4()),
        "exp": expire,
    }

    token = jwt.encode(payload, _require_secret_key(), algorithm=settings.ALGORITHM)
    return token, expire


def decode_viewer_access_token(
    token: str,
    *,
    required_scope: Optional[str] = None,
) -> ViewerTokenClaims:
    """
    Decode and validate a viewer JWT.

    Validates the token in isolation only. The caller must still confirm the
    share itself is live — see ``share_viewer_deps.require_share_scope``.
    """
    if not (token or "").strip():
        raise ShareTokenInvalidError("Report viewer token is empty.")

    try:
        payload = jwt.decode(
            token.strip(),
            _require_secret_key(),
            algorithms=[settings.ALGORITHM],
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError as exc:
        raise ShareTokenExpiredError("Report viewer session has expired.") from exc
    except JWTError as exc:
        raise ShareTokenInvalidError(
            "Report viewer token is invalid or malformed.",
        ) from exc

    claims = _validate_payload(payload)

    if required_scope and not claims.has_scope(required_scope):
        raise ShareTokenScopeError(
            f"Report viewer session lacks the {required_scope!r} scope.",
        )

    # The absolute session cap is enforced here as well as at mint time, so an
    # old token cannot outlive it even if minting logic later changes.
    if _utc_now() > claims.session_started_at + timedelta(hours=session_max_hours()):
        raise ShareTokenExpiredError(
            "Report viewer session has reached its maximum duration.",
        )

    return claims


def _validate_payload(payload: Dict[str, Any]) -> ViewerTokenClaims:
    subject = payload.get("sub")
    if subject != VIEWER_TOKEN_SUBJECT:
        raise ShareTokenInvalidError(
            f"Invalid viewer token subject: expected {VIEWER_TOKEN_SUBJECT!r}, got {subject!r}.",
        )

    purpose = payload.get("purpose")
    if purpose != VIEWER_TOKEN_PURPOSE:
        raise ShareTokenInvalidError(
            f"Invalid viewer token purpose: expected {VIEWER_TOKEN_PURPOSE!r}, got {purpose!r}.",
        )

    share_id = str(payload.get("share_id") or "").strip()
    survey_id = str(payload.get("survey_id") or "").strip()
    if not share_id or not survey_id:
        raise ShareTokenInvalidError("Viewer token is missing share_id or survey_id.")

    raw_scope = payload.get("scope") or []
    if not isinstance(raw_scope, (list, tuple)):
        raise ShareTokenInvalidError("Viewer token scope must be a list.")
    scope = tuple(s for s in (str(x).strip() for x in raw_scope) if s in ALLOWED_SCOPES)
    if SCOPE_READ not in scope:
        raise ShareTokenScopeError("Viewer token does not grant report read access.")

    try:
        pin_version = int(payload.get("pv"))
    except (TypeError, ValueError):
        raise ShareTokenInvalidError("Viewer token is missing a valid pin version.") from None

    viewer_id = str(payload.get("viewer_id") or "").strip()
    if not viewer_id:
        raise ShareTokenInvalidError("Viewer token is missing viewer_id.")

    sid_raw = payload.get("sid")
    try:
        session_started_at = datetime.fromtimestamp(float(sid_raw), tz=timezone.utc)
    except (TypeError, ValueError):
        raise ShareTokenInvalidError("Viewer token is missing a valid session start.") from None

    exp_raw = payload.get("exp")
    expires_at: Optional[datetime] = None
    if exp_raw is not None:
        if isinstance(exp_raw, datetime):
            expires_at = exp_raw if exp_raw.tzinfo else exp_raw.replace(tzinfo=timezone.utc)
        else:
            expires_at = datetime.fromtimestamp(float(exp_raw), tz=timezone.utc)

    return ViewerTokenClaims(
        subject=str(subject),
        purpose=str(purpose),
        share_id=share_id,
        survey_id=survey_id,
        scope=scope,
        pin_version=pin_version,
        viewer_id=viewer_id,
        session_started_at=session_started_at,
        jti=str(payload.get("jti") or ""),
        expires_at=expires_at,
    )
