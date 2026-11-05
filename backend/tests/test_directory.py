"""Marketplace Directory + the Organization listing filter (Phase 12). See
backend/directory_routes.py."""
from tests.test_inventory import _offer_payload


def test_directory_lists_by_role(client, make_account):
    grower_id = make_account("grower")
    buyer_id = make_account("international_buyer")

    growers = client.get("/api/directory?roles=grower").get_json()["entries"]
    assert any(e["account_id"] == grower_id for e in growers)
    assert not any(e["account_id"] == buyer_id for e in growers)
    assert all(e["role"] == "grower" for e in growers)

    both = client.get("/api/directory?roles=grower,international_buyer").get_json()["entries"]
    assert any(e["account_id"] == grower_id for e in both)
    assert any(e["account_id"] == buyer_id for e in both)

    rejected = client.get("/api/directory?roles=nonsense")
    assert rejected.status_code == 400


def test_directory_never_returns_contact_details(client, make_account):
    account_id = make_account("grower")
    client.put("/api/profile", json={
        "contact_visible": True, "contact_name": "Should Not Appear",
        "contact_phone": "555-0100", "contact_email": "nope@example.com",
    })
    entries = client.get("/api/directory?roles=grower").get_json()["entries"]
    entry = next(e for e in entries if e["account_id"] == account_id)
    # Even with contact_visible ON, the directory carries no contact fields at all.
    for leaked in ("contact_name", "contact_phone", "contact_email", "email"):
        assert leaked not in entry


def test_has_listings_filter_and_listing_counts(client, make_account):
    account_id = make_account("grower")
    without = client.get("/api/directory?roles=grower&has_listings=1").get_json()["entries"]
    assert not any(e["account_id"] == account_id for e in without)

    client.post("/api/offers", json=_offer_payload(status="published"))
    with_listings = client.get("/api/directory?roles=grower&has_listings=1").get_json()["entries"]
    entry = next(e for e in with_listings if e["account_id"] == account_id)
    assert entry["active_offer_count"] == 1
    assert entry["active_listing_count"] == 1
    assert "1 supply offer" in entry["listing_summary"]


def test_organizations_filter_narrows_browse_to_one_account(client, make_account):
    first_id = make_account("grower")
    first_offer = client.post("/api/offers", json=_offer_payload(
        commodity="Corn", status="published",
    )).get_json()["offer"]

    second_id = make_account("grower")
    second_offer = client.post("/api/offers", json=_offer_payload(
        commodity="Corn", status="published",
    )).get_json()["offer"]

    only_first = client.get(f"/api/offers?organizations={first_id}").get_json()["offers"]
    ids = {o["id"] for o in only_first}
    assert first_offer["id"] in ids
    assert second_offer["id"] not in ids

    both = client.get(f"/api/offers?organizations={first_id},{second_id}").get_json()["offers"]
    both_ids = {o["id"] for o in both}
    assert first_offer["id"] in both_ids and second_offer["id"] in both_ids


def test_organizations_endpoint_lists_id_name_role(client, make_account):
    account_id = make_account("grower")
    orgs = client.get("/api/organizations").get_json()["organizations"]
    mine = next(o for o in orgs if o["account_id"] == account_id)
    assert mine["role"] == "grower"
    assert mine["name"]
