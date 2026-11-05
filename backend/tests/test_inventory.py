"""Grower Inventory — the shared-pool cap offers and bid-responses draw against. See
backend/inventory_routes.py."""


def _offer_payload(**overrides):
    payload = {
        "commodity": "Corn", "variety": "", "marketing_year": "2099-2100",
        "quantity_basis": "grain", "listing_timing": "available",
        "delivery_window_start": "", "delivery_window_end": "", "expected_volume": "400", "uom": "bushels",
        "acres_offered": "", "area_unit": "acres", "yield_rate": "", "yield_unit": "",
        "price_type": "", "desired_price": "", "protein_pct": "", "moisture_pct_max": "",
        "min_order": "", "harvest_start": "", "harvest_end": "",
        "sustainability_attributes": [], "specialty_attributes": [],
        "locations": [], "certifications": [], "status": "draft",
    }
    payload.update(overrides)
    return payload


def test_put_and_get_grain_inventory(client, make_account):
    make_account("grower")
    resp = client.put("/api/grower-inventory/Corn/2099-2100", json={
        "quantity_basis": "grain", "total_volume": "1000", "uom": "bushels",
    })
    assert resp.status_code == 200
    row = resp.get_json()["inventory"]
    assert row["total_volume"] == 1000
    assert row["uom"] == "bushels"

    listed = client.get("/api/grower-inventory").get_json()["inventory"]
    assert any(r["commodity"] == "Corn" and r["marketing_year"] == "2099-2100" for r in listed)


def test_delete_blocked_while_committed_then_allowed_after_withdraw(client, make_account):
    make_account("grower")
    client.put("/api/grower-inventory/Corn/2099-2100", json={
        "quantity_basis": "grain", "total_volume": "1000", "uom": "bushels",
    })
    created = client.post("/api/offers", json=_offer_payload()).get_json()
    offer_id = created["offer"]["id"]

    blocked = client.delete("/api/grower-inventory/Corn/2099-2100?quantity_basis=grain")
    assert blocked.status_code == 400
    assert "committed" in blocked.get_json()["error"]

    withdrawn = client.post(f"/api/offers/{offer_id}/withdraw")
    assert withdrawn.status_code == 200

    allowed = client.delete("/api/grower-inventory/Corn/2099-2100?quantity_basis=grain")
    assert allowed.status_code == 200

    listed = client.get("/api/grower-inventory").get_json()["inventory"]
    assert not any(r["commodity"] == "Corn" and r["marketing_year"] == "2099-2100" for r in listed)


def test_offer_creation_blocked_past_remaining_inventory(client, make_account):
    make_account("grower")
    client.put("/api/grower-inventory/Barley/2099-2100", json={
        "quantity_basis": "grain", "total_volume": "100", "uom": "bushels",
    })
    over_cap = client.post("/api/offers", json=_offer_payload(
        commodity="Barley", marketing_year="2099-2100", expected_volume="500",
    ))
    assert over_cap.status_code == 400
    assert "exceeds your remaining" in over_cap.get_json()["error"]
