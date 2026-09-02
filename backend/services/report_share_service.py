"""
Shareable, client-facing report links with a seat limit and an expiry.

A share link exposes ONE survey's finished report to people with no account.
Anyone holding the URL can open it — that is deliberate, because the analyst
sends the link to a client who forwards it on to their own colleagues. What the
analyst controls is not *who* opens it but *how many* and *for how long*:

  * `max_viewers` caps the number of distinct people who may ever open the link.
    Send it to a client with a limit of 5 and the sixth person is turned away.
  * `expires_at` ends access on a date, or never if the analyst chooses.
  * revoking kills the link outright.

Counting distinct people without a login means identifying browsers, not
humans. Each visitor is issued a `viewer_id` that its browser keeps, and the
seat is charged to that id. The honest limits of this are documented on
`register_viewer` — it is a sharing control, not an access control, and it is
not trying to be one.

Tokens are stored in plaintext on purpose. An earlier design hashed them, but
the analyst has to be able to re-copy a link from the report and from the share
table long after creating it, which a hash makes impossible. With no
authentication in front of the link the hash bought little anyway: the URL is
the whole credential either way.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from backend.config import settings
from backend.database import db

COLLECTION = "report_shares"

#: Long enough that guessing is not worth attempting.
_TOKEN_BYTES = 24

#: Public handle for a link, used by the admin UI so the URL token never has to
#: travel in a management request.
_SHARE_ID_BYTES = 12


class ShareLimitReached(Exception):
    """Raised when a new visitor would exceed the link's seat limit."""

    def __init__(self, max_viewers: int):
        super().__init__("This report link has reached its viewer limit")
        self.max_viewers = max_viewers


def _now() -> datetime:
    """
    Current time, timezone-aware.

    Aware rather than `utcnow()` because the two sources of datetimes here
    disagree: the API receives `expires_at` as an ISO-8601 string with a zone
    (aware), while MongoDB hands stored values back without one (naive).
    Comparing the two raises `TypeError: can't compare offset-naive and
    offset-aware datetimes` — which is exactly what broke share creation. Every
    value is normalised through `_as_aware` before any comparison so the two
    worlds can never meet uncompared.
    """
    return datetime.now(timezone.utc)


def _as_aware(value: Optional[datetime]) -> Optional[datetime]:
    """
    Coerce a datetime to UTC-aware, treating a naive one as already UTC.

    Naive values come back from MongoDB, which stores UTC but drops the zone.
    Reading them as UTC is therefore correct, not a guess.
    """
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _new_share_id() -> str:
    return f"shr_{secrets.token_urlsafe(_SHARE_ID_BYTES)}"


def _hash_client(value: Optional[str]) -> Optional[str]:
    """
    One-way client fingerprint for the activity log.

    Keyed with SECRET_KEY so the stored value cannot be reversed by hashing a
    guessed IP, and truncated because it only ever needs to answer "same
    visitor or a different one", never "which address".
    """
    if not value:
        return None
    digest = hashlib.sha256(f"{settings.SECRET_KEY}:{value}".encode("utf-8"))
    return digest.hexdigest()[:16]


def default_expiry() -> Optional[datetime]:
    """
    The expiry pre-filled in the create dialog.

    A setting rather than a constant, and nullable, so an analyst can choose an
    unlimited link without the backend overruling them.
    """
    days = int(getattr(settings, "REPORT_SHARE_DEFAULT_EXPIRY_DAYS", 30) or 0)
    return _now() + timedelta(days=days) if days > 0 else None


async def create_share(
    survey_id: str,
    *,
    username: Optional[str] = None,
    label: Optional[str] = None,
    max_viewers: Optional[int] = None,
    expires_at: Optional[datetime] = None,
    use_default_expiry: bool = True,
) -> Dict[str, Any]:
    """
    Mint a new share link.

    Each call creates a distinct link rather than reusing one per survey, so an
    analyst can issue separate links with separate seat limits and revoke one
    without breaking the others.

    `max_viewers=None` means unlimited seats; `expires_at=None` with
    `use_default_expiry=False` means the link never expires.
    """
    doc = {
        "share_id": _new_share_id(),
        "survey_id": survey_id,
        "token": secrets.token_urlsafe(_TOKEN_BYTES),
        "label": (label or "").strip() or None,
        "created_at": _now(),
        "created_by": username,
        "revoked_at": None,
        "expires_at": _as_aware(expires_at)
        if expires_at is not None
        else (default_expiry() if use_default_expiry else None),
        # None = unlimited. A limit of 0 would be a link nobody can open, which
        # is what revoking is for, so it is normalised away.
        "max_viewers": int(max_viewers) if max_viewers and int(max_viewers) > 0 else None,
        # Both export formats are always offered. The field is kept so a future
        # per-link toggle has somewhere to live, but with no authentication in
        # front of the link there is nothing for it to protect today.
        "allow_download": True,
        "viewers": [],
        "view_count": 0,
        "last_viewed_at": None,
        "pptx_downloads": 0,
        "pdf_downloads": 0,
    }
    await db.get_collection(COLLECTION).insert_one(doc)
    return doc


async def create_or_get_share(survey_id: str, username: Optional[str] = None) -> Dict[str, Any]:
    """
    Return the active share for a survey, creating one on first request.

    Retained for the existing one-click "copy link" callers. New code should use
    :func:`create_share`, which supports per-link seat limits.
    """
    collection = db.get_collection(COLLECTION)

    existing = await collection.find_one({"survey_id": survey_id, "revoked_at": None})
    if existing:
        return existing

    return await create_share(survey_id, username=username)


async def get_or_create_master_share(
    survey_id: str,
    *,
    username: Optional[str] = None,
) -> Dict[str, Any]:
    """
    The report's one share link, created on first ask.

    Deliberately idempotent, mirroring the survey master link: a report has a
    single URL that everyone opens, and what varies is the restrictions on it,
    not how many links exist. Asking twice hands back the same link rather than
    minting a rival to the one already sent to a client.

    An earlier design allowed several links per report so each recipient could
    have separate limits. That turned out to be the wrong trade — it made the
    common case ("copy the link for this report") ambiguous, and left the UI
    asking people to create something that already existed.
    """
    collection = db.get_collection(COLLECTION)

    existing = await collection.find_one({"survey_id": survey_id, "revoked_at": None})
    if existing:
        # A link whose expiry has lapsed is not a usable link; give the report a
        # live one rather than handing back a URL that resolves to nothing.
        expires_at = _as_aware(existing.get("expires_at"))
        if not expires_at or expires_at >= _now():
            return existing
        # Keyed on share_id rather than _id: _id only exists because the driver
        # mutates the inserted document, which is an implementation detail to
        # depend on. share_id is set by this module and always present.
        await collection.update_one(
            {"share_id": existing["share_id"]},
            {"$set": {"revoked_at": _now(), "revoked_by": "expired"}},
        )

    return await create_share(survey_id, username=username)


async def reset_master_share(
    survey_id: str,
    *,
    username: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Replace the report's link with a fresh one.

    The old URL stops working immediately. This is the answer to a link that
    reached the wrong person or whose seats are spent on people who should no
    longer have access — there is still exactly one link afterwards, it is just
    a different one.
    """
    previous = await db.get_collection(COLLECTION).find_one(
        {"survey_id": survey_id, "revoked_at": None}
    )
    await revoke_share(survey_id)

    return await create_share(
        survey_id,
        username=username,
        label=(previous or {}).get("label"),
        max_viewers=(previous or {}).get("max_viewers"),
        expires_at=_as_aware((previous or {}).get("expires_at")),
        # Carry the old settings across: resetting is about the URL, not about
        # discarding the limits someone deliberately chose.
        use_default_expiry=not (previous or {}).get("expires_at"),
    )


async def resolve_share(token: str) -> Optional[Dict[str, Any]]:
    """
    Look up a live share by token.

    Returns None for unknown, revoked or expired tokens so every failure path
    looks identical to a caller — a revoked link must not be distinguishable
    from one that never existed.

    The seat limit is deliberately NOT checked here: exceeding it is a distinct
    outcome the visitor should be told about ("this link is full"), not a
    pretence that the report does not exist. See :func:`register_viewer`.
    """
    if not token:
        return None

    share = await db.get_collection(COLLECTION).find_one({"token": token})
    if not share or share.get("revoked_at"):
        return None

    expires_at = _as_aware(share.get("expires_at"))
    if expires_at and expires_at < _now():
        return None

    return share


async def get_share(share_id: str) -> Optional[Dict[str, Any]]:
    return await db.get_collection(COLLECTION).find_one({"share_id": share_id})


async def list_shares(survey_id: str) -> List[Dict[str, Any]]:
    """Every link ever minted for a report, newest first, for the admin table."""
    cursor = db.get_collection(COLLECTION).find({"survey_id": survey_id})
    shares = await cursor.to_list(length=200)
    shares.sort(
        key=lambda s: _as_aware(s.get("created_at")) or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    return shares


def seats_used(share: Dict[str, Any]) -> int:
    return len(share.get("viewers") or [])


def seats_remaining(share: Dict[str, Any]) -> Optional[int]:
    """None when the link has unlimited seats."""
    limit = share.get("max_viewers")
    if not limit:
        return None
    return max(0, int(limit) - seats_used(share))


def share_status(share: Dict[str, Any]) -> str:
    """Derived state for the admin table."""
    if share.get("revoked_at"):
        return "revoked"
    expires_at = _as_aware(share.get("expires_at"))
    if expires_at and expires_at < _now():
        return "expired"
    remaining = seats_remaining(share)
    if remaining == 0:
        return "full"
    if not share.get("viewers"):
        return "unopened"
    return "active"


async def register_viewer(
    token: str,
    viewer_id: str,
    *,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Charge a seat to this visitor and record the view.

    Returns the updated share. Raises :class:`ShareLimitReached` when the link
    is full and this visitor is not already one of its viewers — a returning
    viewer never consumes a second seat, so a client re-reading the report on
    Monday is not locked out of their own link.

    **What a seat actually counts.** Without a login the only durable handle on
    a visitor is an id their browser stores. So the limit counts *browsers that
    have not cleared their storage*, which is a good proxy for people and a poor
    one for adversaries: a determined viewer can free a seat with a private
    window. That is the accepted trade for a link that opens in one click, and
    it is why this is a sharing control rather than an access control.

    The write is a single conditional update so two people opening a link with
    one seat left cannot both be admitted by a check-then-write race.
    """
    collection = db.get_collection(COLLECTION)
    now = _now()

    # Returning viewer: refresh their record, never charge a second seat.
    updated = await collection.find_one_and_update(
        {"token": token, "revoked_at": None, "viewers.viewer_id": viewer_id},
        {
            "$set": {"viewers.$.last_seen": now, "last_viewed_at": now},
            "$inc": {"viewers.$.view_count": 1, "view_count": 1},
        },
        return_document=True,
    )
    if updated:
        return updated

    share = await resolve_share(token)
    if not share:
        raise ShareLimitReached(0)

    limit = share.get("max_viewers")
    entry = {
        "viewer_id": viewer_id,
        "first_seen": now,
        "last_seen": now,
        "view_count": 1,
        "ip_hash": _hash_client(ip),
        "user_agent": (user_agent or "")[:200] or None,
    }

    # `$expr` with `$size` makes the seat check part of the write itself, so the
    # limit holds under concurrent first-time opens.
    query: Dict[str, Any] = {"token": token, "revoked_at": None}
    if limit:
        query["$expr"] = {"$lt": [{"$size": {"$ifNull": ["$viewers", []]}}, int(limit)]}

    updated = await collection.find_one_and_update(
        query,
        {
            "$push": {"viewers": entry},
            "$set": {"last_viewed_at": now},
            "$inc": {"view_count": 1},
        },
        return_document=True,
    )

    if not updated:
        raise ShareLimitReached(int(limit or 0))
    return updated


async def record_download(token: str, kind: str) -> None:
    """Best-effort export telemetry; never blocks the download."""
    field = "pdf_downloads" if kind == "pdf" else "pptx_downloads"
    try:
        await db.get_collection(COLLECTION).update_one(
            {"token": token}, {"$inc": {field: 1}}
        )
    except Exception:
        pass


async def record_view(token: str) -> None:
    """Legacy counter kept for callers that do not identify a viewer."""
    try:
        await db.get_collection(COLLECTION).update_one(
            {"token": token},
            {"$inc": {"view_count": 1}, "$set": {"last_viewed_at": _now()}},
        )
    except Exception:
        pass


async def update_share(
    share_id: str,
    *,
    max_viewers: Optional[int] = None,
    expires_at: Optional[datetime] = None,
    label: Optional[str] = None,
    clear_expiry: bool = False,
) -> Optional[Dict[str, Any]]:
    """
    Change a link's limits without reissuing it.

    Lowering `max_viewers` below the seats already taken does not evict anyone —
    existing viewers keep working and no new ones are admitted, which is the
    behaviour an analyst tightening a limit actually wants.
    """
    updates: Dict[str, Any] = {}
    if max_viewers is not None:
        updates["max_viewers"] = int(max_viewers) if int(max_viewers) > 0 else None
    if clear_expiry:
        updates["expires_at"] = None
    elif expires_at is not None:
        updates["expires_at"] = _as_aware(expires_at)
    if label is not None:
        updates["label"] = label.strip() or None

    if not updates:
        return await get_share(share_id)

    return await db.get_collection(COLLECTION).find_one_and_update(
        {"share_id": share_id}, {"$set": updates}, return_document=True
    )


async def revoke_share_by_id(share_id: str, username: Optional[str] = None) -> bool:
    """Kill one link. Returns True when a live link was revoked."""
    result = await db.get_collection(COLLECTION).update_one(
        {"share_id": share_id, "revoked_at": None},
        {"$set": {"revoked_at": _now(), "revoked_by": username}},
    )
    return bool(result.modified_count)


async def revoke_share(survey_id: str) -> int:
    """Kill every live link for a survey. Returns how many were revoked."""
    result = await db.get_collection(COLLECTION).update_many(
        {"survey_id": survey_id, "revoked_at": None},
        {"$set": {"revoked_at": _now()}},
    )
    return int(result.modified_count)


def share_path(share: Dict[str, Any]) -> str:
    """Path a share link is served at, relative to whatever host serves the app."""
    return f"/r/{share.get('token')}"


def to_admin_dict(share: Dict[str, Any], *, base_url: str = "") -> Dict[str, Any]:
    """
    Shape one share for the admin table.

    Both `path` and `url` are returned, and the client should prefer `path`.
    The server's idea of its own public address comes from configuration that
    is correct in production and wrong everywhere else — pointing a locally
    tested link at the production domain, for instance. The browser copying the
    link already knows the host it is on, so it can join the two reliably.
    """
    viewers = share.get("viewers") or []
    path = share_path(share)
    return {
        "share_id": share.get("share_id"),
        "survey_id": share.get("survey_id"),
        "label": share.get("label"),
        "path": path,
        "url": f"{base_url.rstrip('/')}{path}" if base_url else None,
        "token": share.get("token"),
        "status": share_status(share),
        "max_viewers": share.get("max_viewers"),
        "seats_used": len(viewers),
        "seats_remaining": seats_remaining(share),
        "view_count": share.get("view_count", 0),
        "expires_at": share.get("expires_at"),
        "created_at": share.get("created_at"),
        "created_by": share.get("created_by"),
        "revoked_at": share.get("revoked_at"),
        "last_viewed_at": share.get("last_viewed_at"),
        "pptx_downloads": share.get("pptx_downloads", 0),
        "pdf_downloads": share.get("pdf_downloads", 0),
        "viewers": [
            {
                "viewer_id": v.get("viewer_id"),
                "first_seen": v.get("first_seen"),
                "last_seen": v.get("last_seen"),
                "view_count": v.get("view_count", 0),
            }
            for v in viewers
        ],
    }
