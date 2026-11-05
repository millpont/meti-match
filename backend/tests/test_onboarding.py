"""Self-service registration — the entry point for every role. See backend/onboarding_routes.py."""
import pytest

from conftest import ROLE_ENDPOINTS


@pytest.mark.parametrize("role", list(ROLE_ENDPOINTS))
def test_onboard_each_role(role, make_account, client):
    account_id = make_account(role)
    assert account_id

    me = client.get("/api/me").get_json()
    assert me["authenticated"] is True
    assert me["account_id"] == account_id
    assert me["role"] == role


def test_cannot_onboard_twice_in_the_same_session(make_account, client):
    make_account("grower")
    # Same session (same fake auth0 "login") tries to onboard again — already_onboarded() should
    # block it rather than creating a second account for one login.
    resp = client.post("/api/onboarding/grower", json={
        "name": "Second Attempt", "company": "Should Not Be Created", "ein_last4": "9999",
        "phone": "555-0199", "email": "second@example.com",
    })
    assert resp.status_code == 400
    assert "error" in resp.get_json()
