"""Shared pytest fixtures for the backend test suite.

These are integration tests against the REAL database this environment's SUPABASE_URL /
SUPABASE_SERVICE_KEY point at (see sb.py) — there is no local/mocked database, matching how this
app has been manually verified throughout development. **Point CI at a dedicated test Supabase
project, not production** — every test is careful to only create and tear down its own disposable
accounts/listings (never touching pre-existing data), but a crashed or interrupted run could
leave orphaned rows behind, and no automated test run should have routine write access to
production data.

Every request goes through Flask's real test client, not a bypassed/undecorated view function —
`session_transaction()` fakes a login by writing straight into the Flask session, and CSRF is
disabled for the test app, but everything else (URL routing, the `@requires_auth` decorator,
auth.py's freeze check, etc.) runs for real, exactly like a genuine request would. This is what
"data flows through" means here: these tests create real rows via the real endpoints, read them
back via the real endpoints, and delete them via the real endpoints (or clean up directly when no
delete endpoint exists), the same round trip a user's browser would make.
"""
import uuid

import pytest

import app as app_module
import sb

ROLE_ENDPOINTS = {
    "grower": "/api/onboarding/grower",
    "program_operator": "/api/onboarding/operator",
    "international_buyer": "/api/onboarding/buyer",
    "service_provider": "/api/onboarding/service_provider",
}


@pytest.fixture(scope="session")
def flask_app():
    application = app_module.create_app()
    application.config.update(TESTING=True, WTF_CSRF_ENABLED=False)
    return application


@pytest.fixture(autouse=True)
def _business_verification_off_by_default(monkeypatch):
    """Most tests are about something other than business verification and shouldn't each have
    to set up an identifier + document first — tests that exercise the gate turn it back on with
    the `verification_on` fixture below."""
    monkeypatch.setattr(app_module.config, "BUSINESS_VERIFICATION_REQUIRED", False)


@pytest.fixture()
def verification_on(monkeypatch):
    monkeypatch.setattr(app_module.config, "BUSINESS_VERIFICATION_REQUIRED", True)


@pytest.fixture()
def client(flask_app):
    return flask_app.test_client()


def login_as(client, *, account_id, role, roles=None, account_name="Pytest Account"):
    """Directly write a fake login into the test client's session — the equivalent of a real
    Auth0 callback having already resolved this browser to this account. Use this to switch which
    party the client is acting as mid-test (e.g. a grower creates an offer, then the test needs
    to act as the buyer who responds to it, then switch back to the grower to accept it)."""
    with client.session_transaction() as sess:
        sess["profile"] = {"user_id": f"auth0|test-{account_id}", "name": account_name, "email": "pytest@example.com"}
        sess["account_id"] = str(account_id)
        sess["role"] = role
        sess["roles"] = roles or [role]
        sess["account_name"] = account_name
        # Per-account gate flags cached on the session by login / by /api/me (see auth.py's
        # requires_auth). A real session only ever belongs to one account, so these are stale by
        # definition once a test swaps identity — clear them rather than letting the previous
        # account's frozen/pending state bleed into the next one.
        sess.pop("approval_pending", None)
        sess.pop("frozen", None)
        sess.pop("frozen_reason", None)


@pytest.fixture()
def make_account(client):
    """Factory fixture: `make_account(role)` creates a real, disposable account of that role via
    the actual onboarding endpoint — so onboarding's own side effects (accounts, account_roles,
    auth0_users, the role-specific profile row) are genuinely exercised, not faked — logs the
    test client in as it, and tears everything down after the test. Returns the account_id (str).

    Every account this creates is uniquely named (a random per-call token), so it never collides
    with real data or with another test's accounts, and is always deleted in teardown regardless
    of whether the test passed or failed."""
    created_account_ids = []

    def _make(role, **extra):
        if role not in ROLE_ENDPOINTS:
            raise ValueError(f"unknown role {role!r} — must be one of {sorted(ROLE_ENDPOINTS)}")
        token = uuid.uuid4().hex[:12]
        auth0_id = f"auth0|pytest-{token}"
        company = f"Pytest {role} {token}"
        # Mimics auth.py's _ensure_auth0_user — a real first login always creates this row
        # (account_id NULL) before onboarding ever runs; onboarding only UPDATEs an existing row
        # rather than inserting one, so skipping this would silently leave auth0_users unlinked
        # and make _already_onboarded() always return False for this "login".
        sb.insert("auth0_users", {"auth0_id": auth0_id, "email": f"{token}@example.com", "first_name": "Pytest", "last_name": "Runner"}, return_representation=False)
        with client.session_transaction() as sess:
            sess["profile"] = {"user_id": auth0_id, "name": "Pytest Runner", "email": f"{token}@example.com"}
        resp = client.post(ROLE_ENDPOINTS[role], json={
            "name": "Pytest Runner", "company": company, "ein_last4": "1234",
            "phone": "555-0100", "email": f"{token}@example.com", **extra,
        })
        assert resp.status_code == 200, f"onboarding {role} failed: {resp.get_json()}"
        account_id = resp.get_json()["account_id"]
        created_account_ids.append(account_id)
        return account_id

    yield _make

    # Several tables (offers, bids, listing_responses) reference accounts.id WITHOUT an on-delete
    # cascade, so they have to be cleaned up explicitly before the accounts row itself can be
    # deleted. Three separate passes over every account created in this test, not one pass per
    # account: a contract created between two of this fixture's own accounts only has a real FK
    # cascade path via its response_id -> listing_responses row, so every account's responses
    # must be gone (freeing any contract) before ANY account's own accounts row is deleted,
    # regardless of which of the two accounts happens to be "the seller" on that contract.
    for account_id in created_account_ids:
        sb.delete("listing_responses", {"responder_account_id": f"eq.{account_id}"})
    for account_id in created_account_ids:
        # program_enrollments cascades from the OPERATOR's account but not the grower's, so a
        # grower enrolled with an operator that outlives it in this loop needs this first.
        sb.delete("program_enrollments", {"grower_account_id": f"eq.{account_id}"})
        sb.delete("offers", {"created_by": f"eq.{account_id}"})
        sb.delete("offers", {"on_behalf_of_grower_account_id": f"eq.{account_id}"})
        sb.delete("bids", {"created_by": f"eq.{account_id}"})
        sb.delete("bids", {"on_behalf_of_buyer_account_id": f"eq.{account_id}"})
    for account_id in created_account_ids:
        # auth0_users has no FK cascade from accounts either, so it goes before accounts too;
        # account_roles, grower_inventory, notifications, service_requests, and every
        # role-profile table all cascade-delete from accounts.id (see migrations/0004, 0020,
        # 0022, 0030, 0038) and need no explicit cleanup here.
        sb.delete("auth0_users", {"account_id": f"eq.{account_id}"})
        sb.delete("accounts", {"id": f"eq.{account_id}"})


@pytest.fixture()
def superadmin(client, make_account):
    """Logs the test client in as a disposable account with superadmin rights — `is_superadmin()`
    only checks `session["role"] == "admin"` (or an ID match against a configured bootstrap
    account), so overriding the role after onboarding is enough; this doesn't depend on any
    environment-specific SUPERADMIN_ACCOUNT_ID being configured, so it works against any
    Supabase project the tests are pointed at."""
    account_id = make_account("grower")
    login_as(client, account_id=account_id, role="admin", account_name="Pytest Superadmin")
    return account_id
