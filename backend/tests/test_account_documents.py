""""Company Documentation" uploads on an account, plus the superadmin review surface. See
backend/account_documents_routes.py."""
import io

from conftest import login_as


def test_upload_list_and_delete_company_document(client, make_account):
    make_account("grower")
    uploaded = client.post(
        "/api/account/documents",
        data={
            "label": "Articles of Incorporation",
            "file": (io.BytesIO(b"pytest file contents"), "articles.pdf"),
        },
        content_type="multipart/form-data",
    )
    assert uploaded.status_code == 200
    doc = uploaded.get_json()["document"]
    assert doc["label"] == "Articles of Incorporation"
    assert doc["url"]

    listed = client.get("/api/account/documents").get_json()["documents"]
    assert any(d["id"] == doc["id"] for d in listed)

    deleted = client.delete(f"/api/account/documents/{doc['id']}")
    assert deleted.status_code == 200
    assert not any(d["id"] == doc["id"] for d in client.get("/api/account/documents").get_json()["documents"])


def test_label_is_required(client, make_account):
    make_account("grower")
    missing = client.post(
        "/api/account/documents",
        data={"file": (io.BytesIO(b"x"), "a.pdf")},
        content_type="multipart/form-data",
    )
    assert missing.status_code == 400


def test_documents_are_scoped_to_the_owning_account(client, make_account):
    owner_id = make_account("grower")
    doc = client.post(
        "/api/account/documents",
        data={"label": "Mine", "file": (io.BytesIO(b"x"), "a.pdf")},
        content_type="multipart/form-data",
    ).get_json()["document"]

    make_account("international_buyer")
    # A different account sees its own (empty) list, and can't delete someone else's document.
    assert client.get("/api/account/documents").get_json()["documents"] == []
    assert client.delete(f"/api/account/documents/{doc['id']}").status_code == 404

    # Non-admins can't reach the review surface either.
    assert client.get(f"/api/admin/accounts/{owner_id}/documents").status_code == 403


def test_superadmin_can_review_any_accounts_documents(client, make_account, superadmin):
    # superadmin fixture logs the client in as an admin; make a separate account with a document
    # first, then switch back.
    owner_id = make_account("grower")
    client.post(
        "/api/account/documents",
        data={"label": "Confirmation Letter", "file": (io.BytesIO(b"x"), "letter.pdf")},
        content_type="multipart/form-data",
    )
    login_as(client, account_id=superadmin, role="admin")
    reviewed = client.get(f"/api/admin/accounts/{owner_id}/documents")
    assert reviewed.status_code == 200
    assert any(d["label"] == "Confirmation Letter" for d in reviewed.get_json()["documents"])
