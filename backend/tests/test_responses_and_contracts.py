"""The core golden path: a grower publishes an offer, a buyer responds to it, the grower accepts,
and a real contract is created — data flowing all the way through offers -> listing_responses ->
contracts, visible to both parties. See backend/responses_routes.py / contracts_routes.py."""
from conftest import login_as


def test_accepting_a_response_creates_a_contract_for_both_parties(client, make_account):
    grower_id = make_account("grower")
    offer = client.post("/api/offers", json={
        "commodity": "Corn", "variety": "", "marketing_year": "2099-2100",
        "quantity_basis": "grain", "listing_timing": "available",
        "delivery_window_start": "", "delivery_window_end": "", "expected_volume": "1000", "uom": "bushels",
        "acres_offered": "", "area_unit": "acres", "yield_rate": "", "yield_unit": "",
        "price_type": "fixed", "desired_price": "5.00", "protein_pct": "", "moisture_pct_max": "",
        "min_order": "", "harvest_start": "", "harvest_end": "",
        "sustainability_attributes": [], "specialty_attributes": [],
        "locations": [], "certifications": [], "status": "published",
    }).get_json()["offer"]

    buyer_id = make_account("international_buyer")
    response = client.post(f"/api/offers/{offer['id']}/respond", json={
        "proposed_volume": "1000",
    })
    assert response.status_code == 200
    response_id = response.get_json()["response"]["id"]

    # Switch back to the grower — only the listing's creator may accept a response.
    login_as(client, account_id=grower_id, role="grower")
    accepted = client.post(f"/api/responses/{response_id}/status", json={"status": "accepted"})
    assert accepted.status_code == 200
    assert accepted.get_json()["status"] == "accepted"

    # A fully-committed offer closes itself (see update_status) — confirms the listing side of
    # this transition took effect, not just the response row.
    my_offers = client.get("/api/offers/mine").get_json()["offers"]
    updated_offer = next(o for o in my_offers if o["id"] == offer["id"])
    assert updated_offer["status"] == "accepted"

    grower_contracts = client.get("/api/contracts").get_json()["contracts"]
    assert any(c["response_id"] == response_id for c in grower_contracts)

    login_as(client, account_id=buyer_id, role="international_buyer")
    buyer_contracts = client.get("/api/contracts").get_json()["contracts"]
    assert any(c["response_id"] == response_id for c in buyer_contracts)


def test_cannot_respond_to_your_own_offer(client, make_account):
    make_account("grower")
    offer = client.post("/api/offers", json={
        "commodity": "Corn", "variety": "", "marketing_year": "2099-2100",
        "quantity_basis": "grain", "listing_timing": "available",
        "delivery_window_start": "", "delivery_window_end": "", "expected_volume": "300", "uom": "bushels",
        "acres_offered": "", "area_unit": "acres", "yield_rate": "", "yield_unit": "",
        "price_type": "", "desired_price": "", "protein_pct": "", "moisture_pct_max": "",
        "min_order": "", "harvest_start": "", "harvest_end": "",
        "sustainability_attributes": [], "specialty_attributes": [],
        "locations": [], "certifications": [], "status": "published",
    }).get_json()["offer"]

    resp = client.post(f"/api/offers/{offer['id']}/respond", json={"proposed_volume": "100"})
    assert resp.status_code == 400
