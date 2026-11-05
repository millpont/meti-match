"""Cheap, broad coverage: the app boots, every blueprint is wired up, and the core routes are
actually gated by auth (a regression here — e.g. a decorator silently dropped during a refactor —
would otherwise surface as a confusing 500 or a security hole, not a clean test failure)."""
import pytest


@pytest.mark.parametrize("path", [
    "/api/offers",
    "/api/bids",
    "/api/profile",
    "/api/grower-inventory",
    "/api/production-data",
    "/api/taxonomy",
    "/api/notifications",
    "/api/contracts",
    "/api/service-providers",
    "/api/service-requests/mine",
])
def test_requires_auth(client, path):
    resp = client.get(path)
    assert resp.status_code == 401
    assert resp.get_json()["error"]


def test_me_unauthenticated(client):
    resp = client.get("/api/me")
    assert resp.status_code == 200
    assert resp.get_json()["authenticated"] is False


def test_taxonomy_list_open_to_any_authenticated_role(client, make_account):
    make_account("grower")
    resp = client.get("/api/taxonomy")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["success"] is True
    assert isinstance(body["terms"], list)
