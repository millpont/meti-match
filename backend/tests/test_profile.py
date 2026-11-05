"""Profile system — own-profile edit and the public-profile contact-visibility gate (see
backend/profile_routes.py). Every test here uses its own disposable accounts — never a real,
pre-existing account — since this endpoint mutates real account rows."""
from conftest import login_as


def test_update_own_profile_round_trips(client, make_account):
    make_account("grower")
    updated = client.put("/api/profile", json={
        "bio": "Pytest bio", "website_url": "example.com",
        "links": [{"label": "Site", "url": "example.org"}],
        "contact_visible": False, "contact_name": "Test Person",
        "contact_phone": "555-0100", "contact_email": "test@example.com",
    })
    assert updated.status_code == 200
    profile = updated.get_json()["profile"]
    assert profile["bio"] == "Pytest bio"
    # A bare domain gets a scheme prepended so it doesn't resolve as a same-site relative link
    # (see profile_routes.py's _normalize_url) — this is the exact bug class that was fixed.
    assert profile["website_url"] == "https://example.com"
    assert profile["links"][0]["url"] == "https://example.org"

    fetched = client.get("/api/profile").get_json()["profile"]
    assert fetched["bio"] == "Pytest bio"


def test_display_name_overrides_header_name_via_api_me(client, make_account):
    make_account("grower")
    before = client.get("/api/me").get_json()
    assert before["display_name"] is None

    updated = client.put("/api/profile", json={"display_name": "Jordan Rivers"})
    assert updated.get_json()["profile"]["display_name"] == "Jordan Rivers"

    after = client.get("/api/me").get_json()
    assert after["display_name"] == "Jordan Rivers"


def test_public_profile_hides_contact_info_until_opted_in(client, make_account):
    owner_id = make_account("grower")
    client.put("/api/profile", json={
        "contact_visible": False, "contact_name": "Hidden Person",
        "contact_phone": "555-0100", "contact_email": "hidden@example.com",
    })

    viewer_id = make_account("international_buyer")
    hidden = client.get(f"/api/accounts/{owner_id}/public-profile").get_json()["profile"]
    assert hidden["contact_visible"] is False
    assert "contact_name" not in hidden

    login_as(client, account_id=owner_id, role="grower")
    client.put("/api/profile", json={"contact_visible": True})

    login_as(client, account_id=viewer_id, role="international_buyer")
    visible = client.get(f"/api/accounts/{owner_id}/public-profile").get_json()["profile"]
    assert visible["contact_visible"] is True
    assert visible["contact_name"] == "Hidden Person"
    assert "reputation" in visible
