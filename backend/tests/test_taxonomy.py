"""Superadmin-managed vocabulary — read is open to any authenticated role, writes are
superadmin-only (see backend/taxonomy_routes.py)."""
import uuid


def test_non_admin_cannot_create_a_term(client, make_account):
    make_account("grower")
    resp = client.post("/api/admin/taxonomy", json={
        "type": "attribute", "label": f"pytest-{uuid.uuid4().hex[:8]}", "definition": "",
    })
    assert resp.status_code == 403


def test_superadmin_can_create_list_and_delete_a_term(client, superadmin):
    label = f"pytest-{uuid.uuid4().hex[:8]}"
    created = client.post("/api/admin/taxonomy", json={
        "type": "service_category", "label": label, "definition": "A pytest-created term.",
    })
    assert created.status_code == 200
    term_id = created.get_json()["term"]["id"]

    listed = client.get("/api/taxonomy?type=service_category").get_json()["terms"]
    assert any(t["label"] == label for t in listed)

    deleted = client.delete(f"/api/admin/taxonomy/{term_id}")
    assert deleted.status_code == 200

    listed_again = client.get("/api/taxonomy?type=service_category").get_json()["terms"]
    assert not any(t["label"] == label for t in listed_again)


def test_attribute_term_requires_a_segment_other_types_reject_it(client, superadmin):
    label = f"pytest-{uuid.uuid4().hex[:8]}"
    missing_segment = client.post("/api/admin/taxonomy", json={"type": "attribute", "label": label})
    assert missing_segment.status_code == 400

    created = client.post("/api/admin/taxonomy", json={"type": "attribute", "label": label, "segment": "specialty"})
    assert created.status_code == 200
    term = created.get_json()["term"]
    assert term["segment"] == "specialty"

    retagged = client.patch(f"/api/admin/taxonomy/{term['id']}", json={"segment": "sustainability"})
    assert retagged.get_json()["term"]["segment"] == "sustainability"

    non_attribute_label = f"pytest-{uuid.uuid4().hex[:8]}"
    rejected = client.post("/api/admin/taxonomy", json={
        "type": "practice", "label": non_attribute_label, "segment": "specialty",
    })
    assert rejected.status_code == 400

    client.delete(f"/api/admin/taxonomy/{term['id']}")


def test_duplicate_label_for_the_same_type_is_rejected(client, superadmin):
    label = f"pytest-{uuid.uuid4().hex[:8]}"
    first = client.post("/api/admin/taxonomy", json={"type": "practice", "label": label})
    assert first.status_code == 200
    term_id = first.get_json()["term"]["id"]

    dup = client.post("/api/admin/taxonomy", json={"type": "practice", "label": label})
    assert dup.status_code == 400

    client.delete(f"/api/admin/taxonomy/{term_id}")
