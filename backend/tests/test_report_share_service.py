"""
Share links widen access to client data, so the failure modes matter more than
the happy path. These pin the security-relevant behaviour:

  * a revoked link must be indistinguishable from one that never existed
  * an expired link must not resolve
  * re-issuing must not silently invalidate a link already sent to a client
  * a seat limit must hold, and must not lock out a viewer who already has one

The fake collection below emulates only the query shapes the service actually
emits — including the `$expr`/`$size` seat check and the `viewers.$` positional
update — so a change to those queries shows up here rather than in production.
"""

from datetime import datetime, timedelta, timezone

import pytest

from backend.services import report_share_service as svc


def _matches(doc, query):
    """Match the subset of Mongo query syntax the service uses."""
    for key, expected in query.items():
        if key == "$expr":
            # Only shape in use: {"$lt": [{"$size": {"$ifNull": ["$viewers", []]}}, n]}
            lt = expected.get("$lt")
            size_of = lt[0]["$size"]["$ifNull"][0].lstrip("$")
            if not len(doc.get(size_of) or []) < lt[1]:
                return False
            continue
        if key == "viewers.viewer_id":
            if not any(v.get("viewer_id") == expected for v in doc.get("viewers") or []):
                return False
            continue
        if doc.get(key) != expected:
            return False
    return True


class _FakeCollection:
    """Minimal stand-in for the Motor collection the service uses."""

    def __init__(self, docs=None):
        self.docs = list(docs or [])

    async def find_one(self, query):
        for doc in self.docs:
            if _matches(doc, query):
                return doc
        return None

    def find(self, query):
        matched = [d for d in self.docs if _matches(d, query)]

        class _Cursor:
            async def to_list(self, length=None):
                return matched[:length] if length else matched

        return _Cursor()

    async def insert_one(self, doc):
        self.docs.append(doc)
        return type("R", (), {"inserted_id": "x"})()

    def _apply(self, doc, update, query=None):
        for k, v in (update.get("$set") or {}).items():
            if ".$." in k:
                field, _, sub = k.partition(".$.")
                target = query.get(f"{field}.viewer_id") if query else None
                for item in doc.get(field) or []:
                    if item.get("viewer_id") == target:
                        item[sub] = v
            else:
                doc[k] = v
        for k, v in (update.get("$inc") or {}).items():
            if ".$." in k:
                field, _, sub = k.partition(".$.")
                target = query.get(f"{field}.viewer_id") if query else None
                for item in doc.get(field) or []:
                    if item.get("viewer_id") == target:
                        item[sub] = (item.get(sub) or 0) + v
            else:
                doc[k] = (doc.get(k) or 0) + v
        for k, v in (update.get("$push") or {}).items():
            doc.setdefault(k, []).append(v)

    async def update_one(self, query, update):
        doc = await self.find_one(query)
        if doc is None:
            return type("R", (), {"modified_count": 0})()
        self._apply(doc, update, query)
        return type("R", (), {"modified_count": 1})()

    async def find_one_and_update(self, query, update, return_document=True):
        doc = await self.find_one(query)
        if doc is None:
            return None
        self._apply(doc, update, query)
        return doc

    async def update_many(self, query, update):
        n = 0
        for doc in self.docs:
            if _matches(doc, query):
                self._apply(doc, update, query)
                n += 1
        return type("R", (), {"modified_count": n})()


@pytest.fixture
def collection(monkeypatch):
    fake = _FakeCollection()
    monkeypatch.setattr(svc.db, "get_collection", lambda _name: fake)
    return fake


# ── Token issuance ─────────────────────────────────────────────────────────


async def test_creating_a_share_returns_an_opaque_token(collection):
    share = await svc.create_or_get_share("survey-1", username="analyst")

    assert share["survey_id"] == "survey-1"
    assert share["revoked_at"] is None
    # Opaque: knowing the survey id must not reveal the token.
    assert "survey-1" not in share["token"]
    assert len(share["token"]) >= 24


async def test_creating_twice_returns_the_same_link(collection):
    """Copy-link must not invalidate a URL the client already has."""
    first = await svc.create_or_get_share("survey-1")
    second = await svc.create_or_get_share("survey-1")

    assert first["token"] == second["token"]
    assert len(collection.docs) == 1


async def test_create_share_always_mints_a_separate_link(collection):
    """
    Distinct links are what make per-recipient seat limits possible, so
    `create_share` must not fold into an existing one the way copy-link does.
    """
    a = await svc.create_share("survey-1", max_viewers=5)
    b = await svc.create_share("survey-1", max_viewers=2)

    assert a["token"] != b["token"]
    assert a["share_id"] != b["share_id"]
    assert len(collection.docs) == 2


async def test_tokens_differ_between_surveys(collection):
    a = await svc.create_or_get_share("survey-a")
    b = await svc.create_or_get_share("survey-b")
    assert a["token"] != b["token"]


# ── Resolution ─────────────────────────────────────────────────────────────


async def test_resolve_returns_the_share_for_a_live_token(collection):
    share = await svc.create_or_get_share("survey-1")
    resolved = await svc.resolve_share(share["token"])

    assert resolved is not None
    assert resolved["survey_id"] == "survey-1"


async def test_revoked_token_resolves_to_nothing(collection):
    share = await svc.create_or_get_share("survey-1")
    revoked = await svc.revoke_share("survey-1")

    assert revoked == 1
    assert await svc.resolve_share(share["token"]) is None


async def test_unknown_token_resolves_to_nothing(collection):
    """Same result as a revoked token — the two must be indistinguishable."""
    assert await svc.resolve_share("not-a-real-token") is None
    assert await svc.resolve_share("") is None


async def test_expired_token_resolves_to_nothing(collection):
    share = await svc.create_or_get_share("survey-1")
    share["expires_at"] = datetime.utcnow() - timedelta(days=1)

    assert await svc.resolve_share(share["token"]) is None


async def test_links_carry_a_default_expiry_the_analyst_can_override(collection):
    """
    Links used to live forever by default. They now start with the configured
    expiry pre-filled, and an analyst who wants an unlimited link asks for one.
    """
    default = await svc.create_share("survey-1")
    assert default["expires_at"] is not None
    assert await svc.resolve_share(default["token"]) is not None

    unlimited = await svc.create_share("survey-1", use_default_expiry=False)
    assert unlimited["expires_at"] is None
    assert await svc.resolve_share(unlimited["token"]) is not None


async def test_reissuing_after_revoke_produces_a_new_token(collection):
    """An old link must not be revivable by pressing copy again."""
    first = await svc.create_or_get_share("survey-1")
    await svc.revoke_share("survey-1")
    second = await svc.create_or_get_share("survey-1")

    assert second["token"] != first["token"]
    assert await svc.resolve_share(first["token"]) is None
    assert await svc.resolve_share(second["token"]) is not None


# ── Timezone handling ──────────────────────────────────────────────────────
#
# The API receives `expires_at` as ISO-8601 with a zone (aware); MongoDB hands
# stored datetimes back without one (naive). Mixing them raises TypeError, which
# is what made "Create link" fail with a 500 in the browser while every unit
# test passed — because the tests only ever used naive values.


async def test_creating_a_share_with_an_aware_expiry_does_not_raise(collection):
    """The exact payload the browser sends: an ISO string with a Z suffix."""
    aware = datetime.now(timezone.utc) + timedelta(days=7)
    share = await svc.create_share("survey-1", max_viewers=5, expires_at=aware)

    # Reached only if no TypeError was raised comparing aware against naive.
    assert svc.share_status(share) == "unopened"
    assert svc.to_admin_dict(share, base_url="https://x.test")["status"] == "unopened"


async def test_resolve_and_status_accept_a_naive_stored_expiry(collection):
    """What Mongo actually returns: the same instant, minus the zone."""
    share = await svc.create_share("survey-1")
    share["expires_at"] = datetime.utcnow() + timedelta(days=3)  # naive, as stored

    assert await svc.resolve_share(share["token"]) is not None
    assert svc.share_status(share) in ("unopened", "active")


@pytest.mark.parametrize(
    "expiry",
    [
        datetime.now(timezone.utc) - timedelta(days=1),   # aware, past
        datetime.utcnow() - timedelta(days=1),            # naive, past
    ],
)
async def test_expiry_is_enforced_regardless_of_awareness(collection, expiry):
    share = await svc.create_share("survey-1")
    share["expires_at"] = expiry

    assert await svc.resolve_share(share["token"]) is None
    assert svc.share_status(share) == "expired"


async def test_updating_expiry_with_an_aware_value_keeps_the_link_usable(collection):
    share = await svc.create_share("survey-1")
    later = datetime.now(timezone.utc) + timedelta(days=90)

    await svc.update_share(share["share_id"], expires_at=later)

    assert await svc.resolve_share(share["token"]) is not None
    assert svc.share_status(share) != "expired"


async def test_listing_sorts_cleanly_when_timestamps_mix_awareness(collection):
    """Sorting mixed values used to raise the same TypeError."""
    old = await svc.create_share("survey-1")
    old["created_at"] = datetime.utcnow() - timedelta(days=2)          # naive
    new = await svc.create_share("survey-1")
    new["created_at"] = datetime.now(timezone.utc)                      # aware

    shares = await svc.list_shares("survey-1")
    assert [s["share_id"] for s in shares] == [new["share_id"], old["share_id"]]


# ── One link per report (master-link semantics) ────────────────────────────


async def test_get_or_create_is_idempotent(collection):
    """
    A report has one link, like the survey master link. Asking twice must hand
    back the same URL — minting a rival to one already sent to a client is the
    failure this guards.
    """
    first = await svc.get_or_create_master_share("survey-1", username="analyst")
    second = await svc.get_or_create_master_share("survey-1")

    assert first["token"] == second["token"]
    assert len([d for d in collection.docs if not d.get("revoked_at")]) == 1


async def test_an_expired_link_is_replaced_rather_than_returned(collection):
    """Handing back a URL that resolves to nothing is worse than issuing a new one."""
    stale = await svc.get_or_create_master_share("survey-1")
    stale["expires_at"] = datetime.now(timezone.utc) - timedelta(days=1)

    fresh = await svc.get_or_create_master_share("survey-1")

    assert fresh["token"] != stale["token"]
    assert await svc.resolve_share(stale["token"]) is None
    assert await svc.resolve_share(fresh["token"]) is not None


async def test_reset_swaps_the_url_and_keeps_the_limits(collection):
    """Resetting changes the address, not the policy someone chose."""
    original = await svc.get_or_create_master_share("survey-1")
    await svc.update_share(original["share_id"], max_viewers=3)

    fresh = await svc.reset_master_share("survey-1", username="analyst")

    assert fresh["token"] != original["token"]
    assert fresh["max_viewers"] == 3
    assert await svc.resolve_share(original["token"]) is None
    assert await svc.resolve_share(fresh["token"]) is not None
    # Still exactly one usable link afterwards.
    assert len([d for d in collection.docs if not d.get("revoked_at")]) == 1


async def test_reset_frees_the_used_seats(collection):
    """
    The reason to reset a full link: the people holding seats should no longer
    have access, and the new link starts empty.
    """
    share = await svc.get_or_create_master_share("survey-1")
    await svc.update_share(share["share_id"], max_viewers=1)
    await svc.register_viewer(share["token"], "someone")

    fresh = await svc.reset_master_share("survey-1")

    assert svc.seats_used(fresh) == 0
    assert svc.seats_remaining(fresh) == 1


async def test_a_one_seat_link_admits_exactly_one_person(collection):
    """
    The case called out explicitly: restricted to 1, so the second person to
    open the link is told it is restricted rather than shown the report.
    """
    share = await svc.get_or_create_master_share("survey-1")
    await svc.update_share(share["share_id"], max_viewers=1)

    await svc.register_viewer(share["token"], "first-person")

    with pytest.raises(svc.ShareLimitReached):
        await svc.register_viewer(share["token"], "second-person")

    # And the first person keeps working on every later visit.
    await svc.register_viewer(share["token"], "first-person")
    assert svc.seats_used(share) == 1


# ── Seat limits ────────────────────────────────────────────────────────────


async def test_the_sixth_person_is_turned_away_from_a_five_seat_link(collection):
    """The headline behaviour: a limit of 5 admits 5 distinct people, not 6."""
    share = await svc.create_share("survey-1", max_viewers=5)
    token = share["token"]

    for i in range(5):
        await svc.register_viewer(token, f"viewer-{i}")

    with pytest.raises(svc.ShareLimitReached) as exc:
        await svc.register_viewer(token, "viewer-5")

    assert exc.value.max_viewers == 5
    assert svc.seats_used(share) == 5
    assert svc.seats_remaining(share) == 0


async def test_a_returning_viewer_does_not_consume_a_second_seat(collection):
    """
    A client re-reading their own report on Monday must not be locked out of a
    link they already opened on Friday.
    """
    share = await svc.create_share("survey-1", max_viewers=2)
    token = share["token"]

    await svc.register_viewer(token, "alice")
    await svc.register_viewer(token, "alice")
    await svc.register_viewer(token, "alice")
    await svc.register_viewer(token, "bob")

    assert svc.seats_used(share) == 2
    assert share["view_count"] == 4

    alice = next(v for v in share["viewers"] if v["viewer_id"] == "alice")
    assert alice["view_count"] == 3
    assert alice["first_seen"] <= alice["last_seen"]


async def test_a_full_link_still_serves_its_existing_viewers(collection):
    share = await svc.create_share("survey-1", max_viewers=1)
    token = share["token"]

    await svc.register_viewer(token, "alice")
    with pytest.raises(svc.ShareLimitReached):
        await svc.register_viewer(token, "bob")

    # Alice is unaffected by the link being full.
    await svc.register_viewer(token, "alice")
    assert svc.seats_used(share) == 1


async def test_no_limit_means_unlimited_seats(collection):
    share = await svc.create_share("survey-1", max_viewers=None)
    for i in range(25):
        await svc.register_viewer(share["token"], f"viewer-{i}")

    assert svc.seats_used(share) == 25
    assert svc.seats_remaining(share) is None


@pytest.mark.parametrize("limit", [0, -3])
async def test_a_zero_or_negative_limit_means_unlimited_not_unusable(collection, limit):
    """A link nobody can open is what revoking is for, so 0 normalises away."""
    share = await svc.create_share("survey-1", max_viewers=limit)
    assert share["max_viewers"] is None
    await svc.register_viewer(share["token"], "alice")
    assert svc.seats_used(share) == 1


async def test_a_revoked_link_admits_nobody_new(collection):
    share = await svc.create_share("survey-1", max_viewers=5)
    await svc.revoke_share("survey-1")

    with pytest.raises(svc.ShareLimitReached):
        await svc.register_viewer(share["token"], "alice")


async def test_lowering_the_limit_does_not_evict_existing_viewers(collection):
    """Tightening a limit should stop new people, not break the ones already in."""
    share = await svc.create_share("survey-1", max_viewers=5)
    for i in range(3):
        await svc.register_viewer(share["token"], f"viewer-{i}")

    await svc.update_share(share["share_id"], max_viewers=2)

    await svc.register_viewer(share["token"], "viewer-0")  # existing: still fine
    with pytest.raises(svc.ShareLimitReached):
        await svc.register_viewer(share["token"], "someone-new")

    assert svc.seats_used(share) == 3
    assert svc.seats_remaining(share) == 0  # never negative


# ── Admin management ───────────────────────────────────────────────────────


async def test_expiry_can_be_changed_without_reissuing_the_link(collection):
    share = await svc.create_share("survey-1")
    original_token = share["token"]
    later = datetime.now(timezone.utc) + timedelta(days=90)

    updated = await svc.update_share(share["share_id"], expires_at=later)

    # Compare the instant, not its representation: the service normalises every
    # datetime to UTC-aware on the way in, so a naive input comes back aware.
    assert updated["expires_at"] == later
    assert updated["expires_at"].tzinfo is not None
    assert updated["token"] == original_token


async def test_expiry_can_be_cleared_to_make_a_link_unlimited(collection):
    share = await svc.create_share("survey-1")
    assert share["expires_at"] is not None

    updated = await svc.update_share(share["share_id"], clear_expiry=True)
    assert updated["expires_at"] is None


async def test_revoking_one_link_leaves_the_others_working(collection):
    keep = await svc.create_share("survey-1")
    kill = await svc.create_share("survey-1")

    assert await svc.revoke_share_by_id(kill["share_id"]) is True

    assert await svc.resolve_share(kill["token"]) is None
    assert await svc.resolve_share(keep["token"]) is not None


async def test_revoking_an_already_revoked_link_reports_no_change(collection):
    share = await svc.create_share("survey-1")
    assert await svc.revoke_share_by_id(share["share_id"]) is True
    assert await svc.revoke_share_by_id(share["share_id"]) is False


@pytest.mark.parametrize(
    "mutate,expected",
    [
        (lambda s: None, "unopened"),
        (lambda s: s.update(revoked_at=datetime.utcnow()), "revoked"),
        (lambda s: s.update(expires_at=datetime.utcnow() - timedelta(days=1)), "expired"),
        (lambda s: s.update(viewers=[{"viewer_id": "a"}], max_viewers=1), "full"),
        (lambda s: s.update(viewers=[{"viewer_id": "a"}], max_viewers=5), "active"),
    ],
)
async def test_status_reflects_the_state_the_admin_table_shows(collection, mutate, expected):
    share = await svc.create_share("survey-1")
    mutate(share)
    assert svc.share_status(share) == expected


async def test_admin_view_exposes_a_copyable_url(collection):
    """The analyst has to be able to re-copy a link long after creating it."""
    share = await svc.create_share("survey-1", max_viewers=3, label="Client team")
    await svc.register_viewer(share["token"], "alice")

    row = svc.to_admin_dict(share, base_url="https://reports.example.com/")

    assert row["url"] == f"https://reports.example.com/r/{share['token']}"
    assert row["label"] == "Client team"
    assert row["seats_used"] == 1
    assert row["seats_remaining"] == 2
    assert row["status"] == "active"


async def test_listing_returns_newest_first(collection):
    old = await svc.create_share("survey-1")
    old["created_at"] = datetime.utcnow() - timedelta(days=2)
    new = await svc.create_share("survey-1")

    shares = await svc.list_shares("survey-1")
    assert [s["share_id"] for s in shares] == [new["share_id"], old["share_id"]]


# ── Telemetry must never break serving ─────────────────────────────────────


async def test_view_telemetry_is_recorded(collection):
    share = await svc.create_or_get_share("survey-1")
    await svc.record_view(share["token"])
    await svc.record_view(share["token"])

    assert share["view_count"] == 2
    assert share["last_viewed_at"] is not None


@pytest.mark.parametrize("kind,field", [("pdf", "pdf_downloads"), ("pptx", "pptx_downloads")])
async def test_download_telemetry_is_counted_per_format(collection, kind, field):
    share = await svc.create_share("survey-1")
    await svc.record_download(share["token"], kind)
    assert share[field] == 1


async def test_recording_a_view_never_raises(monkeypatch):
    """Telemetry must never take down report serving."""
    def boom(_name):
        raise RuntimeError("db down")

    monkeypatch.setattr(svc.db, "get_collection", boom)
    await svc.record_view("any")  # must not raise
    await svc.record_download("any", "pdf")  # must not raise
