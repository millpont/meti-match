"""Service Provider marketplace — directory browse + the request -> accept/decline lifecycle
(see backend/service_requests_routes.py)."""
from conftest import login_as


def test_directory_filters_by_service_category(client, make_account):
    provider_id = make_account("service_provider")
    client.put("/api/profile", json={"services_offered": ["Logistics"], "states_covered": ["IA"]})

    make_account("grower")
    matching = client.get("/api/service-providers?service_categories=Logistics").get_json()["providers"]
    assert any(p["account_id"] == provider_id for p in matching)

    non_matching = client.get("/api/service-providers?service_categories=Financing").get_json()["providers"]
    assert not any(p["account_id"] == provider_id for p in non_matching)


def test_service_request_full_lifecycle(client, make_account):
    provider_id = make_account("service_provider")
    grower_id = make_account("grower")

    created = client.post("/api/service-requests", json={
        "service_provider_account_id": provider_id, "service_category": "Logistics",
        "message": "Need freight for 500 bushels.",
    })
    assert created.status_code == 200
    request_id = created.get_json()["request"]["id"]

    # A second pending request to the same provider is blocked...
    dup = client.post("/api/service-requests", json={"service_provider_account_id": provider_id})
    assert dup.status_code == 400

    login_as(client, account_id=provider_id, role="service_provider")
    pending = client.get("/api/service-requests/pending").get_json()["requests"]
    assert any(r["id"] == request_id for r in pending)

    accepted = client.patch(f"/api/service-requests/{request_id}/accept")
    assert accepted.status_code == 200

    login_as(client, account_id=grower_id, role="grower")
    mine = client.get("/api/service-requests/mine").get_json()["requests"]
    accepted_row = next(r for r in mine if r["id"] == request_id)
    assert accepted_row["status"] == "accepted"

    # ...but re-requesting after an accept/decline (not just "pending") is allowed.
    second = client.post("/api/service-requests", json={"service_provider_account_id": provider_id})
    assert second.status_code == 200


def test_chat_opens_only_after_accept(client, make_account):
    provider_id = make_account("service_provider")
    grower_id = make_account("grower")
    request_id = client.post("/api/service-requests", json={
        "service_provider_account_id": provider_id,
    }).get_json()["request"]["id"]

    blocked = client.post(f"/api/service-requests/{request_id}/messages", json={"body": "hi"})
    assert blocked.status_code == 400

    login_as(client, account_id=provider_id, role="service_provider")
    client.patch(f"/api/service-requests/{request_id}/accept")
    sent = client.post(f"/api/service-requests/{request_id}/messages", json={"body": "Sure, let's talk logistics."})
    assert sent.status_code == 200

    login_as(client, account_id=grower_id, role="grower")
    messages = client.get(f"/api/service-requests/{request_id}/messages").get_json()["messages"]
    assert len(messages) == 1
    assert messages[0]["body"] == "Sure, let's talk logistics."
    assert messages[0]["is_mine"] is False

    reply = client.post(f"/api/service-requests/{request_id}/messages", json={"body": "Sounds good."})
    assert reply.status_code == 200

    make_account("international_buyer")
    forbidden = client.get(f"/api/service-requests/{request_id}/messages")
    assert forbidden.status_code == 403


def test_decline_keeps_the_request_on_file(client, make_account):
    provider_id = make_account("service_provider")
    make_account("grower")
    request_id = client.post("/api/service-requests", json={
        "service_provider_account_id": provider_id,
    }).get_json()["request"]["id"]

    login_as(client, account_id=provider_id, role="service_provider")
    declined = client.patch(f"/api/service-requests/{request_id}/decline")
    assert declined.status_code == 200

    pending = client.get("/api/service-requests/pending").get_json()["requests"]
    assert not any(r["id"] == request_id for r in pending)
