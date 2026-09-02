"""
FastAPI dependencies for PPTX capture JWTs (Phase 2).

Capture tokens are accepted only on explicitly allowlisted report-read routes.
All other routes must use :func:`backend.routers.auth.get_current_user`, which
rejects ``sub=pptx-capture`` tokens.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Annotated, Literal, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from backend.analytics_module.pptx_builder.hybrid_export.capture_auth import (
    CAPTURE_TOKEN_SUBJECT,
    CaptureAuthError,
    CaptureTokenClaims,
    decode_capture_access_token,
)
from backend.config import settings
from backend.database import db
from backend.models import TokenData, User, UserInDB
from backend.services.report_viewer_token import VIEWER_TOKEN_SUBJECT

logger = logging.getLogger(__name__)

# Synthetic user identity returned to route handlers for capture tokens.
CAPTURE_SERVICE_USERNAME = CAPTURE_TOKEN_SUBJECT

#: Reserved JWT subjects that identify a *service* or a *share viewer*, never a
#: platform user. Every one of these must be refused by the general-purpose
#: dependencies below, no matter what else the token carries.
#:
#: This is deliberately a set rather than a per-subject check. Rejecting them
#: only because no user document happens to bear these names would be safety by
#: coincidence: create a user called ``report-viewer`` and a share link would
#: silently become an analyst session.
NON_USER_SUBJECTS = frozenset({CAPTURE_TOKEN_SUBJECT, VIEWER_TOKEN_SUBJECT})

AuthKind = Literal["user", "capture"]

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


@dataclass(frozen=True)
class ReportReadAuthContext:
    """Resolved principal for GET /analytics/report/{survey_id}."""

    user: User
    kind: AuthKind
    survey_id: str
    capture_claims: Optional[CaptureTokenClaims] = None

    @property
    def is_capture(self) -> bool:
        return self.kind == "capture"


def _credentials_exception() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


#: Human-readable name per reserved subject, so the 403 says which kind of
#: token was refused instead of a generic "not valid here".
_SUBJECT_LABELS = {
    CAPTURE_TOKEN_SUBJECT: "Capture",
    VIEWER_TOKEN_SUBJECT: "Report share viewer",
}


def _forbidden_capture_scope(subject: Optional[str] = None) -> HTTPException:
    label = _SUBJECT_LABELS.get(subject, "Capture")
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"{label} access token is not valid for this endpoint.",
    )


async def _get_user(username: str) -> Optional[UserInDB]:
    users_col = db.get_collection("users")
    raw = await users_col.find_one({"username": username})
    if not raw:
        return None
    return UserInDB(**raw)


def _decode_jwt_payload(token: str) -> dict:
    return jwt.decode(
        token.strip(),
        settings.SECRET_KEY,
        algorithms=[settings.ALGORITHM],
        options={"verify_aud": False},
    )


def _is_capture_subject(payload: dict) -> bool:
    return payload.get("sub") == CAPTURE_TOKEN_SUBJECT


def _is_non_user_subject(payload: dict) -> bool:
    """True for any reserved service/viewer subject — see NON_USER_SUBJECTS."""
    return payload.get("sub") in NON_USER_SUBJECTS


def user_from_capture_claims(claims: CaptureTokenClaims) -> User:
    """Map validated capture claims to a synthetic active User for route handlers."""
    return User(
        username=CAPTURE_SERVICE_USERNAME,
        role=claims.role,
        is_active=True,
        email=None,
    )


async def _authenticate_regular_user(payload: dict) -> User:
    username = payload.get("sub")
    if not username or username in NON_USER_SUBJECTS:
        raise _credentials_exception()

    user_in_db = await _get_user(str(username))
    if not user_in_db or not user_in_db.is_active:
        raise _credentials_exception()

    return User(**user_in_db.model_dump())


async def resolve_report_read_auth(
    token: str,
    survey_id: str,
) -> ReportReadAuthContext:
    """
    Accept either a normal user JWT or a capture JWT scoped to ``survey_id``.

    Capture tokens never perform a MongoDB user lookup.
    """
    if not (token or "").strip():
        raise _credentials_exception()

    try:
        payload = _decode_jwt_payload(token)
    except JWTError:
        raise _credentials_exception() from None

    normalized_survey = str(survey_id or "").strip()
    if not normalized_survey:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="survey_id is required",
        )

    if _is_capture_subject(payload):
        try:
            claims = decode_capture_access_token(
                token,
                expected_survey_id=normalized_survey,
            )
        except CaptureAuthError as exc:
            logger.warning(
                "Capture token rejected for survey %s: %s",
                normalized_survey,
                exc,
            )
            raise _credentials_exception() from exc

        user = user_from_capture_claims(claims)
        return ReportReadAuthContext(
            user=user,
            kind="capture",
            survey_id=normalized_survey,
            capture_claims=claims,
        )

    # Share-viewer tokens read reports through /analytics/shared/*, which
    # sanitizes the payload. This route returns the raw report document, so a
    # viewer token must not reach it even though it names a survey.
    if _is_non_user_subject(payload):
        raise _forbidden_capture_scope(payload.get("sub"))

    user = await _authenticate_regular_user(payload)
    return ReportReadAuthContext(
        user=user,
        kind="user",
        survey_id=normalized_survey,
        capture_claims=None,
    )


async def reject_capture_token(token: Annotated[str, Depends(oauth2_scheme)]) -> str:
    """
    Shared bearer extraction that fails fast when a capture token hits a
    general-purpose route.
    """
    if not (token or "").strip():
        raise _credentials_exception()

    try:
        payload = _decode_jwt_payload(token)
    except JWTError:
        raise _credentials_exception() from None

    if _is_non_user_subject(payload):
        raise _forbidden_capture_scope(payload.get("sub"))

    return token.strip()


async def get_current_user(
    token: Annotated[str, Depends(reject_capture_token)],
) -> User:
    """
    Standard user authentication — capture and share-viewer JWTs are rejected.
    """
    try:
        payload = _decode_jwt_payload(token)
        if _is_non_user_subject(payload):
            raise _forbidden_capture_scope(payload.get("sub"))
        username: str = payload.get("sub")
        if username is None:
            raise _credentials_exception()
        token_data = TokenData(username=username)
    except JWTError:
        raise _credentials_exception() from None

    user_in_db = await _get_user(token_data.username)
    if not user_in_db or not user_in_db.is_active:
        raise _credentials_exception()

    return User(**user_in_db.model_dump())


async def get_current_user_or_capture_user(
    request: Request,
    survey_id: str,
    token: Annotated[str, Depends(oauth2_scheme)],
) -> User:
    """
    Report-read dependency: user JWT or capture JWT bound to path ``survey_id``.

    Use only on GET /analytics/report/{survey_id}. Status polling and all
    mutating/admin routes must keep :func:`get_current_user`.
    """
    ctx = await resolve_report_read_auth(token, survey_id)
    request.state.report_read_auth = ctx
    request.state.auth_kind = ctx.kind
    if ctx.capture_claims:
        request.state.capture_claims = ctx.capture_claims
    return ctx.user
