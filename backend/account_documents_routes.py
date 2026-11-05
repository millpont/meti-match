""""Company Documentation" uploads on an account — Articles of Incorporation, the IRS
Confirmation Letter, and anything else a superadmin may want to see when reviewing a new
registration. Optional at signup (see frontend onboarding/SignupForm.tsx) and addable later from
the Profile page.

Labeled multi-upload, same shape as offer_documents_routes.py and
production_data_documents_routes.py. Two surfaces:

- `/api/account/documents` — the account's own documents (upload/list/delete). Deliberately
  reachable by an account still awaiting approval (see auth.py's
  PENDING_APPROVAL_ALLOWED_PREFIXES), since attaching documentation is exactly what gets such an
  account approved faster.
- `GET /api/admin/accounts/<id>/documents` — superadmin review of any account's documents.

See migrations/0054_account_documents.sql."""
import logging
import uuid

from flask import Blueprint, request, jsonify, session

import sb
import storage
from auth import requires_auth, is_superadmin
from config import config
from production_data_routes import MAX_UPLOAD_BYTES
import business_verification

logger = logging.getLogger(__name__)
account_documents_bp = Blueprint("account_documents", __name__)

TABLE = "account_documents"


def _require_account():
    acct = session.get("account_id")
    if not acct:
        return None, (jsonify({"error": "no account access"}), 403)
    return str(acct), None


def _document_json(row):
    d = dict(row)
    d["id"] = str(d["id"])
    d["account_id"] = str(d["account_id"])
    d["url"] = storage.signed_url(d["file_path"]) if d.get("file_path") else None
    return d


def _documents_for(account_id):
    rows = sb.select(TABLE, {"account_id": f"eq.{account_id}", "select": "*", "order": "created_at.desc"})
    return [_document_json(r) for r in rows]


@account_documents_bp.route("/api/account/documents", methods=["GET"])
@requires_auth
def list_account_documents():
    acct, err = _require_account()
    if err:
        return err
    return jsonify({"success": True, "documents": _documents_for(acct)})


@account_documents_bp.route("/api/account/documents", methods=["POST"])
@requires_auth
def upload_account_document():
    acct, err = _require_account()
    if err:
        return err

    label = (request.form.get("label") or "").strip()
    if not label:
        return jsonify({"error": "label is required"}), 400
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "file is required"}), 400
    data = file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        return jsonify({"error": "file too large (10MB max)"}), 400

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    path = f"{acct}/company-documents/{uuid.uuid4().hex}.{ext}"
    try:
        storage.upload(path, data, file.mimetype or "application/octet-stream")
    except storage.StorageError as e:
        logger.error("company document upload failed: %s", e)
        return jsonify({"error": "upload failed"}), 502

    created = sb.insert(TABLE, {
        "account_id": acct, "label": label, "file_path": path,
        "content_type": file.mimetype or None, "size_bytes": len(data),
    })
    return jsonify({"success": True, "document": _document_json(created)})


@account_documents_bp.route("/api/account/documents/<document_id>", methods=["DELETE"])
@requires_auth
def delete_account_document(document_id):
    acct, err = _require_account()
    if err:
        return err
    rows = sb.select(TABLE, {"id": f"eq.{document_id}", "account_id": f"eq.{acct}", "select": "file_path", "limit": 1})
    if not rows:
        return jsonify({"error": "document not found"}), 404
    try:
        storage.delete(rows[0]["file_path"])
    except storage.StorageError as e:
        logger.warning("company document delete failed (continuing): %s", e)
    sb.delete(TABLE, {"id": f"eq.{document_id}"})
    return jsonify({"success": True})


@account_documents_bp.route("/api/account/verification", methods=["GET"])
@requires_auth
def get_verification():
    """Business identifier + document status for the Profile tab's verification section."""
    acct, err = _require_account()
    if err:
        return err
    state = business_verification.verification_state(acct, session.get("role"))
    state["required"] = config.BUSINESS_VERIFICATION_REQUIRED
    return jsonify({"success": True, "verification": state})


@account_documents_bp.route("/api/account/verification", methods=["PUT"])
@requires_auth
def put_verification():
    acct, err = _require_account()
    if err:
        return err
    data = request.get_json() or {}
    id_type = (data.get("identifier_type") or "").strip()
    id_value = (data.get("identifier_value") or "").strip()
    allowed = business_verification.ID_TYPES_BY_ROLE.get(session.get("role"), tuple(business_verification.ID_TYPE_LABELS))
    if id_type not in allowed:
        return jsonify({"error": f"identifier_type must be one of {allowed}"}), 400
    if not id_value:
        return jsonify({"error": "identifier_value is required"}), 400
    if len(id_value) > 64:
        return jsonify({"error": "identifier_value is too long"}), 400
    sb.update("accounts", {"id": f"eq.{acct}"}, {"business_id_type": id_type, "business_id_value": id_value})
    state = business_verification.verification_state(acct, session.get("role"))
    state["required"] = config.BUSINESS_VERIFICATION_REQUIRED
    return jsonify({"success": True, "verification": state})


@account_documents_bp.route("/api/admin/accounts/<account_id>/documents", methods=["GET"])
@requires_auth
def admin_list_account_documents(account_id):
    """Superadmin review of an account's company documentation — the point of collecting it."""
    if not is_superadmin():
        return jsonify({"error": "admin only"}), 403
    return jsonify({"success": True, "documents": _documents_for(account_id)})
