"""
The API must start and stay up when the database is unreachable.

A `mongodb+srv://` URI makes pymongo resolve an SRV record *eagerly*, inside
the client constructor. A momentary DNS outage therefore raised straight out of
FastAPI's startup lifespan, the process exited, and — with no restart policy —
the container stayed dead long after the network recovered. The visible symptom
was the login page returning "An unexpected error occurred", because the Vite
proxy could no longer resolve the `backend` host at all.
"""

import pytest

import backend.config as config_module
from backend.database import Database

UNRESOLVABLE_SRV = "mongodb+srv://user:pw@cluster-does-not-exist-xyz.mongodb.net/?retryWrites=true"


@pytest.fixture
def restore_uri():
    original = config_module.settings.MONGO_URI
    yield
    config_module.settings.MONGO_URI = original


def test_connect_fails_soft_instead_of_raising(restore_uri):
    """This exact error used to abort startup and exit the container."""
    config_module.settings.MONGO_URI = UNRESOLVABLE_SRV
    db = Database()

    assert db.connect() is False
    assert db.is_connected is False
    assert "does not exist" in (db.last_error or "")


def test_get_collection_reports_a_clear_error_when_unavailable(restore_uri):
    config_module.settings.MONGO_URI = UNRESOLVABLE_SRV
    db = Database()
    db.connect()

    with pytest.raises(RuntimeError, match="Database unavailable"):
        db.get_collection("surveys")


def test_connection_self_heals_once_the_uri_resolves(restore_uri):
    """
    The failure was transient, so recovery must be automatic. Previously the
    client was never rebuilt, so the app stayed broken until a manual restart.
    """
    config_module.settings.MONGO_URI = UNRESOLVABLE_SRV
    db = Database()
    assert db.connect() is False

    # A reachable URI: constructing a client does no I/O for a non-SRV host,
    # so this verifies the retry path without needing a live server.
    config_module.settings.MONGO_URI = "mongodb://localhost:27017/"
    assert db.ensure_connected() is True
    assert db.is_connected is True
    assert db.last_error is None


def test_ensure_connected_is_cheap_when_already_connected(restore_uri):
    config_module.settings.MONGO_URI = "mongodb://localhost:27017/"
    db = Database()
    assert db.connect() is True

    client = db.client
    assert db.ensure_connected() is True
    # Must not rebuild the client on every call.
    assert db.client is client


def test_close_is_safe_when_never_connected(restore_uri):
    config_module.settings.MONGO_URI = UNRESOLVABLE_SRV
    db = Database()
    db.connect()
    db.close()  # must not raise AttributeError on a None client
