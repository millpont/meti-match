"""Phase 13 client-feedback round: date-range validation, business verification gating, the
operator <-> grower enrollment flows (invite, operator-registered grower + claim), aggregated
operator listings, the Responses tab's counterparty enrichment, and the crop-rotation / "None"
production-data changes. Requires migrations/0058_phase13_feedback.sql."""
import uuid

import sb
from conftest import login_as


def _offer(**overrides):
    body = {
        "commodity": "Corn", "variety": "", "marketing_year": "2099-2100",
        "quantity_basis": "grain", "listing_timing": "available",
        "delivery_window_start": "", "delivery_window_end": "", "expected_volume": "500", "uom": "bushels",
        "acres_offered": "", "area_unit": "acres", "yield_rate": "", "yield_unit": "",
        "price_type": "", "desired_price": "", "protein_pct": "", "moisture_pct_max": "",
        "min_order": "", "harvest_start": "", "harvest_end": "",
        "sustainability_attributes": [], "specialty_attributes": [],
        "locations": [], "certifications": [], "status": "published",
    }
    body.update(overrides)
    return body


# ---------------------------------------------------------------- date ranges

def test_delivery_window_end_before_start_is_rejected(client, make_account):
    make_account("grower")
    bad = client.post("/api/offers", json=_offer(delivery_window_start="2027-05-01", delivery_window_end="2027-04-01"))
    assert bad.status_code == 400
    assert "Delivery Window" in bad.get_json()["error"]

    bad_harvest = client.post("/api/offers", json=_offer(harvest_start="2027-09-10", harvest_end="2027-09-01"))
    assert bad_harvest.status_code == 400

    ok = client.post("/api/offers", json=_offer(delivery_window_start="2027-05-01", delivery_window_end="2027-06-01"))
    assert ok.status_code == 200
    offer_id = ok.get_json()["offer"]["id"]
    # A PATCH that only moves one side is checked against the row's other, unchanged side.
    patched = client.patch(f"/api/offers/{offer_id}", json={"delivery_window_end": "2027-04-01"})
    assert patched.status_code == 400


def test_bid_delivery_window_end_before_start_is_rejected(client, make_account):
    make_account("international_buyer")
    bad = client.post("/api/bids", json={
        "commodity": "Corn", "bid_type": "available_grain", "quantity": "100",
        "delivery_window_start": "2027-05-01", "delivery_window_end": "2027-04-01",
    })
    assert bad.status_code == 400


# ---------------------------------------------------------------- business verification

def test_unverified_account_can_save_drafts_but_not_publish(client, make_account, verification_on):
    grower_id = make_account("grower")
    me = client.get("/api/me").get_json()
    assert me["business_verified"] is False

    refused = client.post("/api/offers", json=_offer())
    assert refused.status_code == 403
    assert refused.get_json()["code"] == "business_verification_required"

    draft = client.post("/api/offers", json=_offer(status="draft"))
    assert draft.status_code == 200
    draft_id = draft.get_json()["offer"]["id"]
    assert client.post(f"/api/offers/{draft_id}/publish").status_code == 403

    # Wrong identifier kind for a grower.
    assert client.put("/api/account/verification", json={
        "identifier_type": "foreign_registration", "identifier_value": "X-1",
    }).status_code == 400
    saved = client.put("/api/account/verification", json={"identifier_type": "ein", "identifier_value": "12-3456789"})
    assert saved.status_code == 200
    # Identifier alone isn't enough — at least one document is required too.
    assert saved.get_json()["verification"]["complete"] is False
    assert client.post(f"/api/offers/{draft_id}/publish").status_code == 403

    sb.insert("account_documents", {
        "account_id": grower_id, "label": "Articles of Organization", "file_path": f"{grower_id}/pytest/doc.pdf",
    }, return_representation=False)
    assert client.get("/api/account/verification").get_json()["verification"]["complete"] is True
    published = client.post(f"/api/offers/{draft_id}/publish")
    assert published.status_code == 200
    assert published.get_json()["offer"]["status"] == "published"
    assert client.get("/api/me").get_json()["business_verified"] is True


def test_unverified_account_cannot_respond_to_a_listing(client, make_account, verification_on):
    grower_id = make_account("grower")
    client.put("/api/account/verification", json={"identifier_type": "ein", "identifier_value": "12-3456789"})
    sb.insert("account_documents", {
        "account_id": grower_id, "label": "IRS letter", "file_path": f"{grower_id}/pytest/doc.pdf",
    }, return_representation=False)
    offer = client.post("/api/offers", json=_offer()).get_json()["offer"]

    make_account("international_buyer")
    refused = client.post(f"/api/offers/{offer['id']}/respond", json={})
    assert refused.status_code == 403
    assert refused.get_json()["code"] == "business_verification_required"


def test_signup_no_longer_requires_ein(client):
    token = uuid.uuid4().hex[:12]
    auth0_id = f"auth0|pytest-{token}"
    sb.insert("auth0_users", {"auth0_id": auth0_id, "email": f"{token}@example.com"}, return_representation=False)
    with client.session_transaction() as sess:
        sess["profile"] = {"user_id": auth0_id, "name": "Pytest", "email": f"{token}@example.com"}
    resp = client.post("/api/onboarding/grower", json={
        "name": "Pytest", "company": f"Pytest no-EIN {token}", "phone": "555-0100", "email": f"{token}@example.com",
    })
    try:
        assert resp.status_code == 200, resp.get_json()
    finally:
        account_id = (resp.get_json() or {}).get("account_id")
        sb.delete("auth0_users", {"auth0_id": f"eq.{auth0_id}"})
        if account_id:
            sb.delete("accounts", {"id": f"eq.{account_id}"})


# ---------------------------------------------------------------- enrollment flows

def test_operator_invites_an_opted_in_grower_who_accepts(client, make_account):
    grower_id = make_account("grower")
    assert client.put("/api/profile", json={"open_to_program_enrollment": True}).status_code == 200
    assert client.get("/api/profile").get_json()["profile"]["open_to_program_enrollment"] is True

    operator_id = make_account("program_operator")
    found = client.get("/api/enrollments/discoverable-growers").get_json()["growers"]
    assert next(g for g in found if g["grower_account_id"] == grower_id)["relationship"] == "available"

    invited = client.post("/api/enrollments/invite", json={"grower_account_id": grower_id})
    assert invited.status_code == 200
    enrollment_id = invited.get_json()["enrollment"]["id"]
    assert invited.get_json()["enrollment"]["status"] == "invited"
    # The operator can't self-approve their own invitation.
    assert client.patch(f"/api/enrollments/{enrollment_id}", json={"status": "active"}).status_code == 400

    login_as(client, account_id=grower_id, role="grower")
    notes = client.get("/api/notifications").get_json()["notifications"]
    assert any(n["type"] == "enrollment_invited" and n["link_type"] == "enrollment" for n in notes)
    invitations = client.get("/api/program-affiliation/invitations").get_json()["invitations"]
    assert [i["id"] for i in invitations] == [enrollment_id]
    assert client.post(f"/api/program-affiliation/invitations/{enrollment_id}/accept").status_code == 200
    assert client.get("/api/program-affiliation").get_json()["affiliation"]["status"] == "active"

    login_as(client, account_id=operator_id, role="program_operator")
    notes = client.get("/api/notifications").get_json()["notifications"]
    assert any(n["type"] == "enrollment_accepted" for n in notes)
    # Still listed afterwards — just tagged, not silently dropped.
    found = client.get("/api/enrollments/discoverable-growers").get_json()["growers"]
    assert next(g for g in found if g["grower_account_id"] == grower_id)["relationship"] == "in_your_program"
    other_operator = make_account("program_operator")
    found = client.get("/api/enrollments/discoverable-growers").get_json()["growers"]
    assert next(g for g in found if g["grower_account_id"] == grower_id)["relationship"] == "in_another_program"
    assert client.post("/api/enrollments/invite", json={"grower_account_id": grower_id}).status_code == 400
    login_as(client, account_id=operator_id, role="program_operator")
    # Now enrolled, the grower's production data is viewable read-only by this operator.
    viewed = client.get(f"/api/enrollments/growers/{grower_id}/production-data")
    assert viewed.status_code == 200
    assert {c["commodity"] for c in viewed.get_json()["commodities"]} == {"Corn", "Sorghum", "Barley"}


def test_growers_not_opted_in_are_not_discoverable(client, make_account):
    grower_id = make_account("grower")
    make_account("program_operator")
    found = client.get("/api/enrollments/discoverable-growers").get_json()["growers"]
    assert all(g["grower_account_id"] != grower_id for g in found)
    assert client.post("/api/enrollments/invite", json={"grower_account_id": grower_id}).status_code == 400
    assert client.get(f"/api/enrollments/growers/{grower_id}/production-data").status_code == 403


def test_grower_join_request_notifies_operator(client, make_account):
    operator_id = make_account("program_operator")
    make_account("grower")
    assert client.post("/api/program-affiliation/request", json={"program_operator_account_id": operator_id}).status_code == 200
    login_as(client, account_id=operator_id, role="program_operator")
    notes = client.get("/api/notifications").get_json()["notifications"]
    assert any(n["type"] == "enrollment_requested" for n in notes)


def test_operator_registers_a_grower_who_later_claims_it(client, make_account):
    operator_id = make_account("program_operator")
    email = f"claim-{uuid.uuid4().hex[:10]}@example.com"
    created = client.post("/api/enrollments/create-grower", json={
        "farm_name": "Pytest Claim Farm", "contact_name": "Pat Grower", "email": email.upper(), "acres_enrolled": "120",
    })
    assert created.status_code == 200, created.get_json()
    grower_id = created.get_json()["grower_account_id"]
    auth0_id = f"auth0|pytest-claim-{uuid.uuid4().hex[:8]}"
    try:
        assert created.get_json()["enrollment"]["status"] == "active"
        # Immediately usable for on-behalf listings — no grower approval needed to enroll.
        growers = client.get("/api/enrollments/active-growers").get_json()["growers"]
        assert any(g["grower_account_id"] == grower_id for g in growers)
        # Same email can't be registered twice.
        assert client.post("/api/enrollments/create-grower", json={"farm_name": "Dup", "email": email}).status_code == 400

        sb.insert("auth0_users", {"auth0_id": auth0_id, "email": email}, return_representation=False)
        # Unverified email: nothing offered, claim refused.
        with client.session_transaction() as sess:
            sess.clear()
            sess["profile"] = {"user_id": auth0_id, "name": "Pat", "email": email, "email_verified": False}
        assert client.get("/api/me").get_json()["claimable_account"] is None
        assert client.post("/api/onboarding/claim", json={"account_id": grower_id}).status_code == 404

        with client.session_transaction() as sess:
            sess["profile"]["email_verified"] = True
        offered = client.get("/api/me").get_json()["claimable_account"]
        assert offered and offered["id"] == grower_id
        claimed = client.post("/api/onboarding/claim", json={"account_id": grower_id})
        assert claimed.status_code == 200
        me = client.get("/api/me").get_json()
        assert me["account_id"] == grower_id and me["role"] == "grower"
    finally:
        sb.delete("program_enrollments", {"grower_account_id": f"eq.{grower_id}"})
        sb.delete("auth0_users", {"auth0_id": f"eq.{auth0_id}"})
        sb.delete("accounts", {"id": f"eq.{grower_id}"})
        login_as(client, account_id=operator_id, role="program_operator")


def test_aggregated_operator_listing(client, make_account):
    operator_id = make_account("program_operator")
    email = f"agg-{uuid.uuid4().hex[:10]}@example.com"
    grower_id = client.post("/api/enrollments/create-grower", json={
        "farm_name": "Pytest Aggregate Farm", "email": email,
    }).get_json()["grower_account_id"]
    try:
        too_much = client.post("/api/offers", json=_offer(
            expected_volume="500", aggregate_growers=[{"grower_account_id": grower_id, "contributed_volume": "900"}],
        ))
        assert too_much.status_code == 400

        created = client.post("/api/offers", json=_offer(
            expected_volume="800", aggregate_growers=[{"grower_account_id": grower_id, "contributed_volume": "600"}],
        ))
        assert created.status_code == 200, created.get_json()
        offer = created.get_json()["offer"]
        assert offer["aggregate_growers"][0]["grower_account_id"] == grower_id
        assert offer["aggregate_growers"][0]["contributed_volume"] == 600
        browsed = client.get("/api/offers?quantity_basis=grain").get_json()["offers"]
        match = next(o for o in browsed if o["id"] == offer["id"])
        assert match["aggregate_growers"][0]["grower_name"] == "Pytest Aggregate Farm"

        notes = sb.select("notifications", {"account_id": f"eq.{grower_id}", "select": "type"})
        assert any(n["type"] == "aggregate_listing_included" for n in notes)
    finally:
        sb.delete("offers", {"created_by": f"eq.{operator_id}"})
        sb.delete("program_enrollments", {"grower_account_id": f"eq.{grower_id}"})
        sb.delete("accounts", {"id": f"eq.{grower_id}"})


# ---------------------------------------------------------------- responses + production data

def test_responses_show_counterparty_and_reply_state(client, make_account):
    grower_id = make_account("grower")
    offer = client.post("/api/offers", json=_offer()).get_json()["offer"]
    buyer_id = make_account("international_buyer")
    response_id = client.post(f"/api/offers/{offer['id']}/respond", json={}).get_json()["response"]["id"]

    mine = client.get("/api/responses").get_json()["made_by_me"]
    row = next(r for r in mine if r["id"] == response_id)
    assert row["counterparty"]["account_id"] == grower_id
    assert row["counterparty"]["organization_name"].startswith("Pytest grower")
    assert row["awaiting_my_reply"] is False

    login_as(client, account_id=grower_id, role="grower")
    to_mine = client.get("/api/responses").get_json()["to_my_listings"]
    row = next(r for r in to_mine if r["id"] == response_id)
    assert row["counterparty"]["account_id"] == buyer_id
    assert row["awaiting_my_reply"] is True  # a new request nobody's acted on yet
    client.post(f"/api/responses/{response_id}/status", json={"status": "in-communication"})
    login_as(client, account_id=buyer_id, role="international_buyer")
    client.post(f"/api/responses/{response_id}/messages", json={"body": "Hello from the buyer"})
    login_as(client, account_id=grower_id, role="grower")
    row = next(r for r in client.get("/api/responses").get_json()["to_my_listings"] if r["id"] == response_id)
    assert row["last_message"]["body"] == "Hello from the buyer"
    assert row["last_message"]["is_mine"] is False
    assert row["awaiting_my_reply"] is True

    client.post(f"/api/responses/{response_id}/status", json={"status": "in-negotiation"})
    client.post(f"/api/responses/{response_id}/status", json={"status": "accepted"})
    login_as(client, account_id=buyer_id, role="international_buyer")
    notes = client.get("/api/notifications").get_json()["notifications"]
    assert any(n["link_type"] == "agreement" and "Agreement reached" in n["title"] for n in notes)


def test_crop_rotation_split_and_none_counts_toward_completion(client, make_account):
    make_account("grower")
    saved = client.put("/api/production-data/Corn", json={
        "actual_yield_per_acre": "180", "irrigation_type": "dryland",
        "crop_rotation_years": "4", "crop_rotation_crops": "3", "input_usage_notes": "n/a",
        "conservation_practices": ["None"], "sustainability_attributes": ["None"], "specialty_attributes": ["None"],
    })
    assert saved.status_code == 200
    body = saved.get_json()
    assert body["crop_rotation_crops"] == 3 and body["crop_rotation_years"] == 4
    assert body["advanced_completion_pct"] == 100

    # "None" marks the section answered but never shows up on a listing.
    offer = client.post("/api/offers", json=_offer(sustainability_attributes=["None"])).get_json()["offer"]
    assert offer["sustainability_attributes"] == []
    assert offer["production"]["conservation_practices"] == []
    assert offer["production"]["crop_rotation_crops"] == 3


def test_hidden_crops_are_off_the_marketplace(client, make_account):
    """Soybeans/Wheat are hidden for now: no new listings, and existing ones (inserted directly
    here, as if created before the change) don't show in browse — but stay on My Listings."""
    grower_id = make_account("grower")
    assert client.post("/api/offers", json=_offer(commodity="Wheat")).status_code == 400
    legacy = sb.insert("offers", {
        "created_by": grower_id, "commodity": "Wheat", "expected_volume": 100, "uom": "bushels",
        "status": "published",
    })
    browsed = client.get("/api/offers").get_json()["offers"]
    assert all(o["id"] != str(legacy["id"]) for o in browsed)
    mine = client.get("/api/offers/mine").get_json()["offers"]
    assert any(o["id"] == str(legacy["id"]) for o in mine)

    make_account("international_buyer")
    assert client.post("/api/bids", json={
        "commodity": "Soybeans", "bid_type": "available_grain", "quantity": "100",
    }).status_code == 400


def test_rfq_drafts_save_unverified_and_publish_once_verified(client, make_account, verification_on):
    buyer_id = make_account("international_buyer")
    rfq = {"commodity": "Corn", "bid_type": "available_grain", "quantity": "100"}
    assert client.post("/api/bids", json=rfq).status_code == 403  # live needs verification
    draft = client.post("/api/bids", json={**rfq, "status": "draft"})
    assert draft.status_code == 200
    bid_id = draft.get_json()["bid"]["id"]
    assert draft.get_json()["bid"]["status"] == "draft"
    assert all(b["id"] != bid_id for b in client.get("/api/bids").get_json()["bids"])
    assert client.post(f"/api/bids/{bid_id}/publish").status_code == 403

    client.put("/api/account/verification", json={"identifier_type": "foreign_registration", "identifier_value": "BR-123"})
    sb.insert("account_documents", {
        "account_id": buyer_id, "label": "Registration certificate", "file_path": f"{buyer_id}/pytest/doc.pdf",
    }, return_representation=False)
    published = client.post(f"/api/bids/{bid_id}/publish")
    assert published.status_code == 200 and published.get_json()["bid"]["status"] == "open"
    assert any(b["id"] == bid_id for b in client.get("/api/bids").get_json()["bids"])


def test_cannot_respond_to_a_listing_that_is_not_live(client, make_account):
    make_account("grower")
    draft = client.post("/api/offers", json=_offer(status="draft")).get_json()["offer"]
    make_account("international_buyer")
    refused = client.post(f"/api/offers/{draft['id']}/respond", json={})
    assert refused.status_code == 400
    assert "isn't open" in refused.get_json()["error"]
