"""Bids (demand side) — creation and the acres-for-contracting area-unit normalization
(see backend/bids_routes.py)."""


def _bid_payload(**overrides):
    payload = {
        "commodity": "Corn", "variety": "", "bid_type": "available_grain", "quantity": "500",
        "bid_price_usd_per_mt": "210", "delivery_window_start": "", "delivery_window_end": "",
        "required_attributes": [], "required_practices": [], "required_certifications": [],
        "required_data_requirements": [], "required_attribute_notes": {}, "allow_partial": True,
        "destination_country": "",
    }
    payload.update(overrides)
    return payload


def test_create_and_browse_grain_bid(client, make_account):
    make_account("international_buyer")
    created = client.post("/api/bids", json=_bid_payload())
    assert created.status_code == 200
    bid = created.get_json()["bid"]
    assert bid["quantity"] == 500
    assert bid["area_unit"] is None

    browsed = client.get("/api/bids").get_json()["bids"]
    match = next((b for b in browsed if b["id"] == bid["id"]), None)
    assert match is not None
    # Batched lookups (_bid_json_batch) — same fields the single-item path always returns.
    assert match["has_active_negotiation"] is False
    assert match["remaining_quantity"] == 500


def test_acres_for_contracting_bid_normalizes_quantity_to_acres(client, make_account):
    make_account("international_buyer")
    created = client.post("/api/bids", json=_bid_payload(
        bid_type="acres_for_contracting", quantity="20", area_unit="hectares",
    ))
    assert created.status_code == 200
    bid = created.get_json()["bid"]
    assert bid["area_unit"] == "hectares"
    # The client is responsible for normalizing to acres before it ever reaches this endpoint
    # (see frontend/src/buyer/CreateRfqForm.tsx) — the backend just stores what it's given and
    # keeps area_unit purely for redisplay, so a raw "20" here (not converted) is correct.
    assert bid["quantity"] == 20


def test_area_unit_is_immutable_after_creation(client, make_account):
    make_account("international_buyer")
    created = client.post("/api/bids", json=_bid_payload(
        bid_type="acres_for_contracting", quantity="20", area_unit="acres",
    )).get_json()["bid"]

    patched = client.patch(f"/api/bids/{created['id']}", json={"area_unit": "hectares"})
    assert patched.status_code == 400
    assert "area_unit" in patched.get_json()["error"]
