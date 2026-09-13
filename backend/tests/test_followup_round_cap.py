"""
The follow-up cap must hold even when the client's round counter resets.

A respondent reported being probed endlessly, and being asked the same question
repeatedly. Both came from the same place: the round number was tracked only in
the browser, and it is ephemeral there — dismissing the panel deletes the
question's state, and navigating between brands wipes it, after which the client
restarts at round 1.

The server trusted that number, so:
  * `current_round (1) > max_rounds (2)` was never true and the cap never fired
  * the history lookup filtered on `round < 1`, matched nothing, and handed the
    engine an empty conversation — so it re-asked what it had already asked

These tests pin the server's own count as the authority.
"""
from __future__ import annotations

import pytest

from backend.voice_feedback.followup_turn_persistence import (
    count_issued_probes,
    load_all_followup_turns,
)


class _FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    def sort(self, *_args, **_kwargs):
        return self

    def __aiter__(self):
        async def gen():
            for d in self._docs:
                yield d

        return gen()


class _FakeCollection:
    """Emulates only the two queries these helpers issue."""

    def __init__(self, docs):
        self.docs = docs

    def _match(self, q):
        out = []
        for d in self.docs:
            if d.get("token") != q.get("token"):
                continue
            if d.get("question_id") != q.get("question_id"):
                continue
            probe_filter = q.get("followup_text")
            if isinstance(probe_filter, dict) and "$nin" in probe_filter:
                if d.get("followup_text") in probe_filter["$nin"]:
                    continue
            out.append(d)
        return out

    async def count_documents(self, q):
        return len(self._match(q))

    def find(self, q):
        return _FakeCursor(self._match(q))


class _FakeDb:
    def __init__(self, docs):
        self._col = _FakeCollection(docs)

    def get_collection(self, _name):
        return self._col


def _turn(round_no, answer, followup):
    return {
        "token": "tok",
        "question_id": "q1",
        "round": round_no,
        "answer_text": answer,
        "followup_text": followup,
        "created_at": round_no,
    }


# ── Counting what actually happened ────────────────────────────────────────


async def test_counts_probes_actually_issued():
    db = _FakeDb([_turn(1, "tasty", "How does it compare?"), _turn(2, "sweeter", "In what way?")])
    assert await count_issued_probes(db, token="tok", question_id="q1") == 2


async def test_evaluated_answers_without_a_probe_do_not_consume_a_round():
    """
    A row is written for every answer the engine evaluates, including ones it
    declined to probe on. Counting rows rather than probes would burn the
    respondent's allowance on questions they were never asked.
    """
    db = _FakeDb([_turn(1, "good", None), _turn(1, "good", ""), _turn(2, "sweeter", "In what way?")])
    assert await count_issued_probes(db, token="tok", question_id="q1") == 1


async def test_count_is_scoped_to_one_respondent_and_question():
    db = _FakeDb([
        _turn(1, "a", "probe A"),
        {**_turn(1, "b", "probe B"), "token": "other-token"},
        {**_turn(1, "c", "probe C"), "question_id": "q2"},
    ])
    assert await count_issued_probes(db, token="tok", question_id="q1") == 1


async def test_no_history_means_round_one():
    assert await count_issued_probes(_FakeDb([]), token="tok", question_id="q1") == 0


# ── The cap the endpoint applies ───────────────────────────────────────────


def _effective_round(client_round: int, issued: int) -> int:
    """Mirrors the endpoint: the client cannot undercount its way past the cap."""
    return max(int(client_round or 1), issued + 1)


@pytest.mark.parametrize("max_rounds", [1, 2, 3])
async def test_cap_holds_when_the_client_keeps_reporting_round_one(max_rounds):
    """
    The reported bug. The client resets to 1 after every dismissal, so it sends
    round 1 forever. The server must still stop at the configured number.
    """
    docs = []
    db = _FakeDb(docs)
    issued_before_refusal = 0

    for _ in range(10):
        issued = await count_issued_probes(db, token="tok", question_id="q1")
        if _effective_round(1, issued) > max_rounds:
            break
        docs.append(_turn(issued + 1, "an answer", f"probe {issued + 1}"))
        issued_before_refusal += 1

    assert issued_before_refusal == max_rounds, (
        f"configured for {max_rounds}, respondent was asked {issued_before_refusal}"
    )


async def test_default_is_two_questions():
    """An analyst who sets nothing gets two probes, per the model default."""
    from backend.models import AiFollowupConfig

    assert AiFollowupConfig().max_rounds == 2


async def test_a_client_ahead_of_the_stored_count_is_respected():
    """A probe issued but not yet persisted must not let the round go backwards."""
    db = _FakeDb([_turn(1, "a", "probe 1")])
    issued = await count_issued_probes(db, token="tok", question_id="q1")
    assert _effective_round(3, issued) == 3


# ── History, so the engine stops repeating itself ──────────────────────────


async def test_full_history_is_returned_regardless_of_round_numbers():
    db = _FakeDb([_turn(1, "tasty", "How does it compare?"), _turn(2, "sweeter", "In what way?")])

    turns = await load_all_followup_turns(db, token="tok", question_id="q1")

    assert [t["role"] for t in turns] == ["user", "assistant", "user", "assistant"]
    assert turns[1]["content"] == "How does it compare?"
    # The engine can now see it already asked this, which is what stops the
    # identical question being issued twice in a row.
    assert turns[3]["content"] == "In what way?"


async def test_history_is_scoped_to_one_respondent_and_question():
    db = _FakeDb([
        _turn(1, "mine", "my probe"),
        {**_turn(1, "theirs", "their probe"), "token": "other-token"},
    ])
    turns = await load_all_followup_turns(db, token="tok", question_id="q1")
    assert all("their" not in t["content"] for t in turns)
