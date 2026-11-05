"""Service Providers are technical-services providers by default; only those flagged as Traders
(service_provider_profiles.is_trader) bid, represent buyers and see agreements. Business
verification still applies to every Service Provider."""
import sb
from conftest import login_as


def _bid(**over):
    return {"commodity": "Corn", "bid_type": "available_grain", "quantity": 100, **over}


def test_non_trader_service_provider_cannot_trade(client, make_account):
    buyer_id = make_account("international_buyer")
    make_account("service_provider")
    me = client.get("/api/me").get_json()
    assert me["is_trader"] is False

    bid = client.post("/api/bids", json=_bid(on_behalf_of_buyer_account_id=buyer_id))
    assert bid.status_code == 403
    assert bid.get_json()["code"] == "trader_only"

    rep = client.post("/api/buyer-representations/request", json={"buyer_account_id": buyer_id})
    assert rep.status_code == 403
    assert rep.get_json()["code"] == "trader_only"

    contracts = client.get("/api/contracts")
    assert contracts.status_code == 403
    assert contracts.get_json()["code"] == "trader_only"


def test_trader_toggle_unlocks_trading(client, make_account):
    buyer_id = make_account("international_buyer")
    sp_id = make_account("service_provider")

    saved = client.put("/api/profile", json={"is_trader": True})
    assert saved.status_code == 200
    assert client.get("/api/me").get_json()["is_trader"] is True
    assert client.get("/api/profile").get_json()["profile"]["is_trader"] is True

    assert client.post("/api/buyer-representations/request", json={"buyer_account_id": buyer_id}).status_code == 200
    assert client.get("/api/contracts").status_code == 200

    # Approve the representation as the buyer, then the trader can bid on their behalf.
    rep = sb.select("buyer_representations", {"service_provider_account_id": f"eq.{sp_id}", "select": "id", "limit": 1})[0]
    sb.update("buyer_representations", {"id": f"eq.{rep['id']}"}, {"status": "active"})
    login_as(client, account_id=sp_id, role="service_provider")
    bid = client.post("/api/bids", json=_bid(on_behalf_of_buyer_account_id=buyer_id))
    assert bid.status_code == 200, bid.get_json()

    client.put("/api/profile", json={"is_trader": False})
    assert client.get("/api/me").get_json()["is_trader"] is False


def test_signup_as_trader(client, make_account):
    make_account("service_provider", is_trader=True)
    assert client.get("/api/me").get_json()["is_trader"] is True


def test_unverified_service_provider_cannot_accept_a_service_request(client, make_account, verification_on):
    provider_id = make_account("service_provider")
    make_account("grower")
    created = client.post("/api/service-requests", json={
        "service_provider_account_id": provider_id, "service_category": "Logistics",
    })
    request_id = created.get_json()["request"]["id"]

    login_as(client, account_id=provider_id, role="service_provider")
    refused = client.patch(f"/api/service-requests/{request_id}/accept")
    assert refused.status_code == 403
    assert refused.get_json()["code"] == "business_verification_required"
