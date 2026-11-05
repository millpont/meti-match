"""Carbon & environmental-data bids and offers (see backend/environmental.py and
migrations/0062_environmental_listings.sql). The first block is pure validation and needs no
database; the rest are integration tests like the rest of this suite."""
import environmental
from environmental import parse_environmental_fields


# ---------- pure validation (no database) ----------

def test_outcome_labels_are_unique_and_never_a_crop():
    labels = environmental.OUTCOME_LABELS
    assert len(set(labels)) == len(labels)
    # A label colliding with a crop would let an outcome listing draw on grain inventory.
    assert not set(labels) & set(environmental.VISIBLE_COMMODITIES)


def test_parse_carbon_fields_maps_outcome_to_label_and_unit():
    fields, err = parse_environmental_fields({
        "asset_class": "carbon", "outcome_type": "removals_t",
        "vintage_years": ["2024", "2025", "2024"], "source_states": ["ia", "IL"],
        "source_commodities": ["Corn"], "methodology": "  Verra VM0042  ",
    })
    assert err is None
    assert fields["commodity"] == "Carbon Removals"
    assert fields["unit"] == "tCO2e"
    assert fields["vintage_years"] == ["2025", "2024"]
    assert fields["source_states"] == ["IA", "IL"]
    assert fields["methodology"] == "Verra VM0042"


def test_parse_rejects_outcome_from_the_other_asset_class():
    _, err = parse_environmental_fields({
        "asset_class": "carbon", "outcome_type": "water_quality_n", "vintage_years": ["2025"],
    })
    assert err and "environmental outcome" in err


def test_parse_requires_valid_vintage_years():
    _, missing = parse_environmental_fields({"asset_class": "environmental", "outcome_type": "acres"})
    assert missing and "vintage" in missing
    _, bad = parse_environmental_fields({
        "asset_class": "environmental", "outcome_type": "acres", "vintage_years": ["25"],
    })
    assert bad and "four-digit" in bad


def test_unit_for_falls_back_to_none_for_grain():
    assert environmental.unit_for({"outcome_type": "water_quantity"}) == "acre-ft"
    assert environmental.unit_for({"commodity": "Corn"}) is None


# ---------- API (integration) ----------

def _carbon_bid(**overrides):
    payload = {
        "asset_class": "carbon", "outcome_type": "removals_t", "quantity": "1000",
        "bid_price_usd_per_mt": "45", "vintage_years": ["2025"], "source_states": ["IA"],
        "required_practices": [], "required_certifications": [], "required_data_requirements": [],
        "allow_partial": True,
    }
    payload.update(overrides)
    return payload


def test_create_and_browse_carbon_bid(client, make_account):
    make_account("international_buyer")
    created = client.post("/api/bids", json=_carbon_bid())
    assert created.status_code == 200, created.get_json()
    bid = created.get_json()["bid"]
    assert bid["commodity"] == "Carbon Removals"
    assert bid["bid_type"] == "environmental_outcome"
    assert bid["asset_class"] == "carbon"
    assert bid["vintage_years"] == ["2025"]

    carbon_only = client.get("/api/bids?asset_classes=carbon").get_json()["bids"]
    assert any(b["id"] == bid["id"] for b in carbon_only)
    grain_only = client.get("/api/bids?asset_classes=grain").get_json()["bids"]
    assert all(b["id"] != bid["id"] for b in grain_only)


def test_environmental_bid_outcome_is_immutable(client, make_account):
    make_account("international_buyer")
    bid = client.post("/api/bids", json=_carbon_bid()).get_json()["bid"]
    patched = client.patch(f"/api/bids/{bid['id']}", json={"outcome_type": "reductions_t"})
    assert patched.status_code == 400
    ok = client.patch(f"/api/bids/{bid['id']}", json={"methodology": "Gold Standard"})
    assert ok.status_code == 200
    assert ok.get_json()["bid"]["methodology"] == "Gold Standard"


def test_create_environmental_data_offer_skips_grain_rules(client, make_account):
    make_account("grower")
    created = client.post("/api/offers", json={
        "asset_class": "environmental", "outcome_type": "acres", "expected_volume": "640",
        "desired_price": "12", "vintage_years": ["2024", "2025"], "source_states": ["NE"],
        "practices": ["Cover Crops"], "data_attributes": ["Traceability"],
    })
    assert created.status_code == 200, created.get_json()
    offer = created.get_json()["offer"]
    assert offer["commodity"] == "Field-Level Environmental Data"
    assert offer["uom"] == "acres"
    assert offer["quantity_basis"] == "outcome"
    assert offer["marketing_year"] == "2025"
    assert offer["locations"] == [{"state": "NE", "counties": []}]
    assert offer["production"]["conservation_practices"] == ["Cover Crops"]

    browsed = client.get("/api/offers?asset_classes=environmental&vintage_years=2024").get_json()["offers"]
    assert any(o["id"] == offer["id"] for o in browsed)


def test_environmental_offer_rejects_on_behalf_listing(client, make_account):
    make_account("program_operator")
    resp = client.post("/api/offers", json={
        "asset_class": "carbon", "outcome_type": "reductions_t", "expected_volume": "10",
        "vintage_years": ["2025"], "on_behalf_of_grower_account_id": "00000000-0000-0000-0000-000000000000",
    })
    assert resp.status_code == 400
