"""Superadmin approval of brand-new accounts (Phase 12).

This feature ships DORMANT — config.ACCOUNT_APPROVAL_REQUIRED defaults to off so that signups
aren't blocked during early testing. That makes these tests the only thing standing between
"written and working" and "written and rotting", so they force the flag on explicitly rather
than testing the (no-op) default path only. The first test pins the default-off behaviour, which
is the regression that would actually hurt: new users silently unable to sign up.
"""
import pytest

import config as config_module
from conftest import login_as


@pytest.fixture()
def approval_required(monkeypatch):
    """Turns the dormant approval flag on for one test."""
    monkeypatch.setattr(config_module.config, "ACCOUNT_APPROVAL_REQUIRED", True)
    yield


def test_with_the_flag_off_a_new_account_is_active_immediately(client, make_account):
    """The default path, and the one that matters most right now: no approval, no blocker."""
    make_account("grower")
    me = client.get("/api/me").get_json()
    assert me["account_approval_required"] is False
    assert me["approval_status"] == "approved"
    # And the account can actually use the app.
    assert client.get("/api/grower-inventory").status_code == 200


def test_with_the_flag_on_a_new_account_starts_pending_and_is_blocked(client, make_account, approval_required):
    make_account("grower")
    me = client.get("/api/me").get_json()
    assert me["account_approval_required"] is True
    assert me["approval_status"] == "pending"

    # Every normal API call is refused while pending...
    blocked = client.get("/api/grower-inventory")
    assert blocked.status_code == 403
    assert blocked.get_json()["pending_approval"] is True

    # ...except attaching the company documentation that gets the account approved.
    assert client.get("/api/account/documents").status_code == 200


def test_superadmin_approval_unblocks_the_account(client, make_account, superadmin, approval_required):
    pending_id = make_account("grower")
    assert client.get("/api/grower-inventory").status_code == 403

    login_as(client, account_id=superadmin, role="admin")
    listed = client.get("/api/admin/accounts").get_json()["accounts"]
    assert next(a for a in listed if a["id"] == pending_id)["approval_status"] == "pending"
    approved = client.patch(f"/api/admin/accounts/{pending_id}/approval", json={"approved": True})
    assert approved.status_code == 200
    assert approved.get_json()["approval_status"] == "approved"

    # Back as the formerly-pending account: /api/me refreshes the gate, no re-login needed.
    login_as(client, account_id=pending_id, role="grower")
    assert client.get("/api/me").get_json()["approval_status"] == "approved"
    assert client.get("/api/grower-inventory").status_code == 200


def test_superadmin_can_decline_with_a_note(client, make_account, superadmin, approval_required):
    pending_id = make_account("grower")
    login_as(client, account_id=superadmin, role="admin")
    declined = client.patch(
        f"/api/admin/accounts/{pending_id}/approval",
        json={"approved": False, "note": "Missing Articles of Incorporation"},
    )
    assert declined.status_code == 200
    assert declined.get_json()["approval_status"] == "declined"

    login_as(client, account_id=pending_id, role="grower")
    me = client.get("/api/me").get_json()
    assert me["approval_status"] == "declined"
    assert me["approval_note"] == "Missing Articles of Incorporation"


def test_superadmin_cannot_decline_their_own_account(client, superadmin, approval_required):
    refused = client.patch(f"/api/admin/accounts/{superadmin}/approval", json={"approved": False})
    assert refused.status_code == 400
