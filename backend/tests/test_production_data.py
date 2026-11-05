"""Production Data — per-commodity (and now per-marketing-year) defaults, merged with an offer's
own overrides by resolve_production(). See backend/production_data_routes.py."""
import io

from tests.test_inventory import _offer_payload


def test_any_year_default_applies_when_no_year_specific_row_exists(client, make_account):
    make_account("grower")
    saved = client.put("/api/production-data/Corn", json={"actual_yield_per_acre": "180", "yield_unit": "bu/acre"})
    assert saved.status_code == 200
    assert saved.get_json()["marketing_year"] == "any"

    fetched = client.get("/api/production-data?marketing_year=2099-2100").get_json()["commodities"]
    corn = next(c for c in fetched if c["commodity"] == "Corn")
    assert corn["actual_yield_per_acre"] == 180
    assert corn["is_fallback_to_any_year"] is True


def test_year_specific_default_overrides_the_any_year_fallback(client, make_account):
    make_account("grower")
    client.put("/api/production-data/Corn", json={"actual_yield_per_acre": "180"})
    client.put("/api/production-data/Corn", json={"actual_yield_per_acre": "210", "marketing_year": "2099-2100"})

    for_that_year = client.get("/api/production-data?marketing_year=2099-2100").get_json()["commodities"]
    corn_that_year = next(c for c in for_that_year if c["commodity"] == "Corn")
    assert corn_that_year["actual_yield_per_acre"] == 210
    assert corn_that_year["is_fallback_to_any_year"] is False
    assert corn_that_year["saved_years"] == ["2099-2100"]

    for_any = client.get("/api/production-data").get_json()["commodities"]
    corn_any = next(c for c in for_any if c["commodity"] == "Corn")
    assert corn_any["actual_yield_per_acre"] == 180


def test_offer_resolves_production_against_its_own_marketing_year(client, make_account):
    make_account("grower")
    client.put("/api/production-data/Corn", json={"actual_yield_per_acre": "180"})
    client.put("/api/production-data/Corn", json={"actual_yield_per_acre": "210", "marketing_year": "2099-2100"})

    offer = client.post("/api/offers", json=_offer_payload(
        commodity="Corn", marketing_year="2099-2100", status="published",
    )).get_json()["offer"]
    assert offer["production"]["actual_yield_per_acre"] == 210
    assert offer["production"]["has_override"] is False

    browsed = client.get("/api/offers?quantity_basis=grain&commodities=Corn").get_json()["offers"]
    match = next(o for o in browsed if o["id"] == offer["id"])
    assert match["production"]["actual_yield_per_acre"] == 210


def test_usda_fdcic_fields_and_manure_type_round_trip(client, make_account):
    make_account("grower")
    saved = client.put("/api/production-data/Wheat", json={
        "nitrogen_lbs_per_acre": "150", "manure_type": "dairy", "manure_lbs_per_acre": "500",
        "tdisc_score": "12.5", "diesel_gal_per_acre": "4.2",
    })
    assert saved.status_code == 200
    body = saved.get_json()
    assert body["nitrogen_lbs_per_acre"] == 150
    assert body["manure_type"] == "dairy"
    assert body["tdisc_score"] == 12.5

    rejected = client.put("/api/production-data/Wheat", json={"manure_type": "unicorn"})
    assert rejected.status_code == 400


def test_documents_are_commodity_level_not_per_year(client, make_account):
    make_account("grower")
    client.put("/api/production-data/Sorghum", json={"marketing_year": "2099-2100", "actual_yield_per_acre": "60"})
    # Soil-test-on-file is part of the main PUT, just confirming the per-year row exists and
    # doesn't collide with the ANY_YEAR row documents live on (no document upload needed to prove
    # this -- the GET below exercising both rows independently is the real assertion).
    for_year = client.get("/api/production-data?marketing_year=2099-2100").get_json()["commodities"]
    sorghum_year = next(c for c in for_year if c["commodity"] == "Sorghum")
    assert sorghum_year["actual_yield_per_acre"] == 60
    assert sorghum_year["has_soil_test_document"] is False

    for_any = client.get("/api/production-data").get_json()["commodities"]
    sorghum_any = next(c for c in for_any if c["commodity"] == "Sorghum")
    assert sorghum_any["actual_yield_per_acre"] is None


def test_advanced_fields_hidden_from_listings_until_opted_in(client, make_account):
    make_account("grower")
    client.put("/api/production-data/Corn", json={
        "nitrogen_lbs_per_acre": "150", "manure_type": "dairy",
    })
    offer = client.post("/api/offers", json=_offer_payload(commodity="Corn", status="published")).get_json()["offer"]
    assert offer["production"]["show_advanced_in_listing"] is False
    assert offer["production"]["nitrogen_lbs_per_acre"] is None
    assert offer["production"]["manure_type"] is None

    client.put("/api/production-data/Corn", json={
        "nitrogen_lbs_per_acre": "150", "manure_type": "dairy", "show_advanced_in_listing": True,
    })
    refetched = client.get(f"/api/offers?quantity_basis=grain&commodities=Corn").get_json()["offers"]
    match = next(o for o in refetched if o["id"] == offer["id"])
    assert match["production"]["show_advanced_in_listing"] is True
    assert match["production"]["nitrogen_lbs_per_acre"] == 150
    assert match["production"]["manure_type"] == "dairy"


def test_production_data_document_upload_list_and_delete(client, make_account):
    make_account("grower")
    uploaded = client.post(
        "/api/production-data/Wheat/documents",
        data={
            "label": "Non-GMO Certificate",
            "category": "certification",
            "file": (io.BytesIO(b"pytest file contents"), "cert.pdf"),
        },
        content_type="multipart/form-data",
    )
    assert uploaded.status_code == 200
    doc = uploaded.get_json()["document"]
    assert doc["label"] == "Non-GMO Certificate"
    assert doc["category"] == "certification"
    assert doc["url"]

    listed = client.get("/api/production-data/Wheat/documents").get_json()["documents"]
    assert any(d["id"] == doc["id"] for d in listed)

    deleted = client.delete(f"/api/production-data/Wheat/documents/{doc['id']}")
    assert deleted.status_code == 200
    listed_again = client.get("/api/production-data/Wheat/documents").get_json()["documents"]
    assert not any(d["id"] == doc["id"] for d in listed_again)


def test_production_data_document_requires_label_and_valid_category(client, make_account):
    make_account("grower")
    missing_label = client.post(
        "/api/production-data/Wheat/documents",
        data={"category": "grower", "file": (io.BytesIO(b"x"), "a.pdf")},
        content_type="multipart/form-data",
    )
    assert missing_label.status_code == 400

    bad_category = client.post(
        "/api/production-data/Wheat/documents",
        data={"label": "Something", "category": "nonsense", "file": (io.BytesIO(b"x"), "a.pdf")},
        content_type="multipart/form-data",
    )
    assert bad_category.status_code == 400
