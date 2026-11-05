"""Open-ended, labeled multi-document uploads on an offer (Phase 11) — additive alongside the 2
fixed verification/soil-test fields. See backend/offer_documents_routes.py."""
import io

from tests.test_inventory import _offer_payload


def _create_offer(client):
    created = client.post("/api/offers", json=_offer_payload())
    assert created.status_code == 200
    return created.get_json()["offer"]["id"]


def test_upload_list_and_delete_offer_document(client, make_account):
    make_account("grower")
    offer_id = _create_offer(client)

    uploaded = client.post(
        f"/api/offers/{offer_id}/documents",
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

    listed = client.get(f"/api/offers/{offer_id}/documents").get_json()["documents"]
    assert any(d["id"] == doc["id"] for d in listed)

    deleted = client.delete(f"/api/offers/{offer_id}/documents/{doc['id']}")
    assert deleted.status_code == 200
    listed_again = client.get(f"/api/offers/{offer_id}/documents").get_json()["documents"]
    assert not any(d["id"] == doc["id"] for d in listed_again)


def test_upload_requires_label_and_valid_category(client, make_account):
    make_account("grower")
    offer_id = _create_offer(client)

    missing_label = client.post(
        f"/api/offers/{offer_id}/documents",
        data={"category": "general", "file": (io.BytesIO(b"x"), "a.pdf")},
        content_type="multipart/form-data",
    )
    assert missing_label.status_code == 400

    bad_category = client.post(
        f"/api/offers/{offer_id}/documents",
        data={"label": "Something", "category": "nonsense", "file": (io.BytesIO(b"x"), "a.pdf")},
        content_type="multipart/form-data",
    )
    assert bad_category.status_code == 400


def test_only_the_creator_can_manage_documents(client, make_account):
    make_account("grower")
    offer_id = _create_offer(client)

    make_account("international_buyer")
    forbidden = client.post(
        f"/api/offers/{offer_id}/documents",
        data={"label": "Something", "category": "general", "file": (io.BytesIO(b"x"), "a.pdf")},
        content_type="multipart/form-data",
    )
    assert forbidden.status_code == 403
