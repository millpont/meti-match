"""Generalized, labeled, multi-document uploads on an offer (Phase 11) -- additive alongside the
2 existing fixed verification/soil-test document fields on `offers` (offers_routes.py's
upload_offer_verification_document/upload_offer_soil_test_document), which stay exactly as they
are. Unlike those, there's no cap here and the uploader picks a free-text label plus a
General/Certification category, so a grower can attach any number of additional documents (e.g.
"Non-GMO Certificate", "Export Permit") beyond what the 2 fixed slots cover.

See migrations/0046_offer_documents.sql."""
import logging
import uuid

from flask import Blueprint, request, jsonify, session

import sb
import storage
from auth import requires_auth
from production_data_routes import MAX_UPLOAD_BYTES

logger = logging.getLogger(__name__)
offer_documents_bp = Blueprint("offer_documents", __name__)

TABLE = "offer_documents"
VALID_CATEGORIES = ("general", "certification")


def _require_account():
    acct = session.get("account_id")
    if not acct:
        return None, (jsonify({"error": "no account access"}), 403)
    return str(acct), None


def _document_json(row):
    d = dict(row)
    d["id"] = str(d["id"])
    d["offer_id"] = str(d["offer_id"])
    d["uploaded_by_account_id"] = str(d["uploaded_by_account_id"])
    d["url"] = storage.signed_url(d["file_path"]) if d.get("file_path") else None
    return d


def _owned_offer(offer_id, acct):
    rows = sb.select("offers", {"id": f"eq.{offer_id}", "select": "id,created_by", "limit": 1})
    if not rows:
        return None, (jsonify({"error": "offer not found"}), 404)
    if str(rows[0]["created_by"]) != acct:
        return None, (jsonify({"error": "only the creator can manage this listing's documents"}), 403)
    return rows[0], None


@offer_documents_bp.route("/api/offers/<offer_id>/documents", methods=["GET"])
@requires_auth
def list_offer_documents(offer_id):
    rows = sb.select(TABLE, {"offer_id": f"eq.{offer_id}", "select": "*", "order": "created_at.desc"})
    return jsonify({"success": True, "documents": [_document_json(r) for r in rows]})


@offer_documents_bp.route("/api/offers/<offer_id>/documents", methods=["POST"])
@requires_auth
def upload_offer_document(offer_id):
    acct, err = _require_account()
    if err:
        return err
    _offer, err = _owned_offer(offer_id, acct)
    if err:
        return err

    label = (request.form.get("label") or "").strip()
    category = request.form.get("category") or "general"
    if not label:
        return jsonify({"error": "label is required"}), 400
    if category not in VALID_CATEGORIES:
        return jsonify({"error": f"category must be one of {VALID_CATEGORIES}"}), 400
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "file is required"}), 400
    data = file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        return jsonify({"error": "file too large (10MB max)"}), 400

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    path = f"{acct}/offers/{offer_id}/documents/{uuid.uuid4().hex}.{ext}"
    try:
        storage.upload(path, data, file.mimetype or "application/octet-stream")
    except storage.StorageError as e:
        logger.error("offer document upload failed: %s", e)
        return jsonify({"error": "upload failed"}), 502

    created = sb.insert(TABLE, {
        "offer_id": offer_id, "uploaded_by_account_id": acct, "label": label, "category": category,
        "file_path": path, "content_type": file.mimetype or None, "size_bytes": len(data),
    })
    return jsonify({"success": True, "document": _document_json(created)})


@offer_documents_bp.route("/api/offers/<offer_id>/documents/<document_id>", methods=["DELETE"])
@requires_auth
def delete_offer_document(offer_id, document_id):
    acct, err = _require_account()
    if err:
        return err
    _offer, err = _owned_offer(offer_id, acct)
    if err:
        return err
    rows = sb.select(TABLE, {"id": f"eq.{document_id}", "offer_id": f"eq.{offer_id}", "select": "file_path", "limit": 1})
    if not rows:
        return jsonify({"error": "document not found"}), 404
    try:
        storage.delete(rows[0]["file_path"])
    except storage.StorageError as e:
        logger.warning("offer document delete failed (continuing): %s", e)
    sb.delete(TABLE, {"id": f"eq.{document_id}"})
    return jsonify({"success": True})
