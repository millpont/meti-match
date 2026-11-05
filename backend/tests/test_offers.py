"""Offers (supply side) — creation, the grain/acres segmentation, and the browse endpoint's
batched response shape (see backend/offers_routes.py)."""


def test_create_and_browse_published_grain_offer(client, make_account):
    make_account("grower")
    created = client.post("/api/offers", json={
        "commodity": "Corn", "variety": "", "marketing_year": "2099-2100",
        "quantity_basis": "grain", "listing_timing": "available",
        "delivery_window_start": "", "delivery_window_end": "", "expected_volume": "500", "uom": "bushels",
        "acres_offered": "", "area_unit": "acres", "yield_rate": "", "yield_unit": "",
        "price_type": "fixed", "desired_price": "5.25", "protein_pct": "", "moisture_pct_max": "",
        "min_order": "", "harvest_start": "", "harvest_end": "",
        "sustainability_attributes": [], "specialty_attributes": [],
        "locations": [], "certifications": [], "status": "published",
    })
    assert created.status_code == 200
    offer = created.get_json()["offer"]
    assert offer["quantity_basis"] == "grain"
    assert offer["expected_volume"] == 500
    assert offer["status"] == "published"

    browsed = client.get("/api/offers?quantity_basis=grain").get_json()["offers"]
    match = next((o for o in browsed if o["id"] == offer["id"]), None)
    assert match is not None, "newly published offer should appear in the grain-filtered browse"
    # These three fields come from the batched lookups in _offer_json_batch — confirms the
    # batching path produces the same shape the single-item path always has.
    assert "production" in match
    assert match["has_active_negotiation"] is False
    assert match["remaining_volume"] == 500


def test_acres_offer_computes_expected_volume_from_yield(client, make_account):
    make_account("grower")
    created = client.post("/api/offers", json={
        "commodity": "Corn", "variety": "", "marketing_year": "2099-2100",
        "quantity_basis": "acres", "listing_timing": "future",
        "delivery_window_start": "2027-11-01", "delivery_window_end": "2027-12-01", "expected_volume": "", "uom": "bushels",
        "acres_offered": "50", "area_unit": "acres", "yield_rate": "150", "yield_unit": "bu/acre",
        "price_type": "", "desired_price": "", "protein_pct": "", "moisture_pct_max": "",
        "min_order": "", "harvest_start": "", "harvest_end": "",
        "sustainability_attributes": [], "specialty_attributes": [],
        "locations": [], "certifications": [], "status": "draft",
    })
    assert created.status_code == 200
    offer = created.get_json()["offer"]
    assert offer["quantity_basis"] == "acres"
    assert offer["expected_volume"] == 50 * 150


def test_grain_characteristics_default_and_sorghum_fields(client, make_account):
    make_account("grower")
    created = client.post("/api/offers", json={
        "commodity": "Sorghum", "variety": "", "marketing_year": "2099-2100",
        "quantity_basis": "grain", "listing_timing": "available",
        "delivery_window_start": "", "delivery_window_end": "", "expected_volume": "500", "uom": "bushels",
        "acres_offered": "", "area_unit": "acres", "yield_rate": "", "yield_unit": "",
        "price_type": "", "desired_price": "", "protein_pct": "", "moisture_pct_max": "",
        "min_order": "", "harvest_start": "", "harvest_end": "",
        "test_weight": "56.5", "seed_variety": "Non-GM",
        "tannin_level_max": "0.5", "non_tannin_sorghum": True, "bnfm_pct": "1.2",
        "sustainability_attributes": [], "specialty_attributes": [],
        "locations": [], "certifications": [], "status": "published",
    })
    assert created.status_code == 200
    offer = created.get_json()["offer"]
    # bcfm_pct wasn't sent -- defaults to 3, not null.
    assert offer["bcfm_pct"] == 3
    assert offer["test_weight"] == 56.5
    assert offer["seed_variety"] == "Non-GM"
    assert offer["tannin_level_max"] == 0.5
    assert offer["non_tannin_sorghum"] is True
    assert offer["bnfm_pct"] == 1.2

    rejected = client.post("/api/offers", json={
        "commodity": "Corn", "variety": "", "marketing_year": "2099-2100",
        "quantity_basis": "grain", "listing_timing": "available",
        "delivery_window_start": "", "delivery_window_end": "", "expected_volume": "500", "uom": "bushels",
        "acres_offered": "", "area_unit": "acres", "yield_rate": "", "yield_unit": "",
        "price_type": "", "desired_price": "", "protein_pct": "", "moisture_pct_max": "",
        "min_order": "", "harvest_start": "", "harvest_end": "",
        "seed_variety": "Maybe",
        "sustainability_attributes": [], "specialty_attributes": [],
        "locations": [], "certifications": [], "status": "published",
    })
    assert rejected.status_code == 400


def test_future_listing_requires_delivery_window_not_just_a_single_date(client, make_account):
    make_account("grower")
    missing = client.post("/api/offers", json={
        "commodity": "Corn", "variety": "", "marketing_year": "2099-2100",
        "quantity_basis": "grain", "listing_timing": "future",
        "delivery_window_start": "", "delivery_window_end": "", "expected_volume": "500", "uom": "bushels",
        "acres_offered": "", "area_unit": "acres", "yield_rate": "", "yield_unit": "",
        "price_type": "", "desired_price": "", "protein_pct": "", "moisture_pct_max": "",
        "min_order": "", "harvest_start": "", "harvest_end": "",
        "sustainability_attributes": [], "specialty_attributes": [],
        "locations": [], "certifications": [], "status": "published",
    })
    assert missing.status_code == 400

    created = client.post("/api/offers", json={
        "commodity": "Corn", "variety": "", "marketing_year": "2099-2100",
        "quantity_basis": "grain", "listing_timing": "future",
        "delivery_window_start": "2027-11-01", "delivery_window_end": "2027-12-01",
        "expected_volume": "500", "uom": "bushels",
        "acres_offered": "", "area_unit": "acres", "yield_rate": "", "yield_unit": "",
        "price_type": "", "desired_price": "", "protein_pct": "", "moisture_pct_max": "",
        "min_order": "", "harvest_start": "", "harvest_end": "",
        "sustainability_attributes": [], "specialty_attributes": [],
        "locations": [], "certifications": [], "status": "published",
    })
    assert created.status_code == 200
    offer = created.get_json()["offer"]
    assert offer["delivery_window_start"] == "2027-11-01"
    assert offer["delivery_window_end"] == "2027-12-01"


def test_offer_quantity_basis_filter_excludes_the_other_basis(client, make_account):
    make_account("grower")
    client.post("/api/offers", json={
        "commodity": "Sorghum", "variety": "", "marketing_year": "2099-2100",
        "quantity_basis": "acres", "listing_timing": "future",
        "delivery_window_start": "2027-11-01", "delivery_window_end": "2027-12-01", "expected_volume": "", "uom": "bushels",
        "acres_offered": "10", "area_unit": "acres", "yield_rate": "50", "yield_unit": "bu/acre",
        "price_type": "", "desired_price": "", "protein_pct": "", "moisture_pct_max": "",
        "min_order": "", "harvest_start": "", "harvest_end": "",
        "sustainability_attributes": [], "specialty_attributes": [],
        "locations": [], "certifications": [], "status": "published",
    })
    grain_only = client.get("/api/offers?quantity_basis=grain&commodities=Sorghum").get_json()["offers"]
    assert all(o["quantity_basis"] == "grain" for o in grain_only)
    acres_only = client.get("/api/offers?quantity_basis=acres&commodities=Sorghum").get_json()["offers"]
    assert all(o["quantity_basis"] == "acres" for o in acres_only)
    assert any(o["commodity"] == "Sorghum" for o in acres_only)
