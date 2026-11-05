"""Role add/switch — previously untested entirely. Covers the Phase 12 rule that Service Provider
is a SINGULAR role: registerable on its own account and joinable as an existing company, but never
added to or switched into from another account. See onboarding_routes.py's ADDABLE_ROLES /
ONBOARDABLE_ROLES and migrations/0055_service_provider_singular_role.sql."""
import sb


def _enable_role_switching(account_id):
    """The superadmin-controlled per-account opt-in both endpoints require
    (migrations/0026_role_switching_toggle.sql), set directly rather than through the admin API so
    these tests stay focused on the role rules themselves."""
    sb.update("accounts", {"id": f"eq.{account_id}"}, {"role_switching_enabled": True})


def test_service_provider_cannot_be_added_as_a_second_role(client, make_account):
    account_id = make_account("grower")
    _enable_role_switching(account_id)

    refused = client.post("/api/roles", json={"role": "service_provider"})
    assert refused.status_code == 400
    assert "service_provider" not in client.get("/api/me").get_json()["roles"]

    # The other roles still work.
    added = client.post("/api/roles", json={"role": "international_buyer"})
    assert added.status_code == 200
    assert "international_buyer" in added.get_json()["roles"]


def test_switching_into_service_provider_is_refused_even_if_the_role_is_held(client, make_account):
    account_id = make_account("grower")
    _enable_role_switching(account_id)
    # Simulate an account that still holds the role from before it became singular — the strip in
    # migrations/0055 removed these, but the endpoint must refuse regardless.
    sb.insert("account_roles", {"account_id": account_id, "role": "service_provider"}, return_representation=False)
    with client.session_transaction() as sess:
        sess["roles"] = ["grower", "service_provider"]

    refused = client.post("/api/switch-role", json={"role": "service_provider"})
    assert refused.status_code == 400
    assert "standalone role" in refused.get_json()["error"]
    # Still on the original role.
    assert client.get("/api/me").get_json()["role"] == "grower"

    sb.delete("account_roles", {"account_id": f"eq.{account_id}", "role": "eq.service_provider"})


def test_switching_between_the_other_roles_still_works(client, make_account):
    account_id = make_account("grower")
    _enable_role_switching(account_id)
    client.post("/api/roles", json={"role": "international_buyer"})

    switched = client.post("/api/switch-role", json={"role": "grower"})
    assert switched.status_code == 200
    assert client.get("/api/me").get_json()["role"] == "grower"


def test_service_provider_is_still_a_valid_standalone_registration(client, make_account):
    """The role isn't gone — it's just not toggleable. Registering one directly must still work,
    and its profile must still expose the service-provider-only fields."""
    make_account("service_provider")
    me = client.get("/api/me").get_json()
    assert me["role"] == "service_provider"

    profile = client.get("/api/profile").get_json()["profile"]
    assert "services_offered" in profile
    assert "states_covered" in profile

    saved = client.put("/api/profile", json={"services_offered": ["Logistics"], "states_covered": ["IA"]})
    assert saved.get_json()["profile"]["services_offered"] == ["Logistics"]
