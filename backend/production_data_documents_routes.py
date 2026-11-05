"""Generalized, labeled, multi-document uploads on a Production Data commodity default --
additive alongside the 2 existing fixed verification/soil-test document fields on
`production_data` (production_data_routes.py's upload_verification_document/
upload_soil_test_document), which stay exactly as they are. The uploader picks a free-text label
plus a "Grower Documents"/"Certification Documents" category, so a grower can attach any number
of additional documents beyond what the 2 fixed slots cover.

Commodity-level, not per-year -- same convention as the 2 fixed document fields (see
production_data_routes.py's _upload_commodity_document docstring).

See migrations/0052_production_data_documents.sql."""
import logging
import uuid

from flask import Blueprint, request, jsonify, session

import sb
import storage
from auth import requires_auth
from production_data_routes import COMMODITIES, MAX_UPLOAD_BYTES

logger = logging.getLogger(__name__)
production_data_documents_bp = Blueprint("production_data_documents", __name__)

TABLE = "production_data_documents"
VALID_CATEGORIES = ("grower", "certification")


def _require_producer():
    acct = session.get("account_id")
    if not acct:
        return None, (jsonify({"error": "no account access"}), 403)
    if session.get("role") not in ("grower", "program_operator"):
        return None, (jsonify({"error": "only growers and program operators have production data"}), 403)
    return str(acct), None


def _document_json(row):
    d = dict(row)
    d["id"] = str(d["id"])
    d["account_id"] = str(d["account_id"])
    d["url"] = storage.signed_url(d["file_path"]) if d.get("file_path") else None
    return d


@production_data_documents_bp.route("/api/production-data/<commodity>/documents", methods=["GET"])
@requires_auth
def list_production_data_documents(commodity):
    acct, err = _require_producer()
    if err:
        return err
    rows = sb.select(TABLE, {
        "account_id": f"eq.{acct}", "commodity": f"eq.{commodity}",
        "select": "*", "order": "created_at.desc",
    })
    return jsonify({"success": True, "documents": [_document_json(r) for r in rows]})


@production_data_documents_bp.route("/api/production-data/<commodity>/documents", methods=["POST"])
@requires_auth
def upload_production_data_document(commodity):
    acct, err = _require_producer()
    if err:
        return err
    if commodity not in COMMODITIES:
        return jsonify({"error": f"commodity must be one of {COMMODITIES}"}), 400

    label = (request.form.get("label") or "").strip()
    category = request.form.get("category") or "grower"
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
    path = f"{acct}/{commodity}/documents/{uuid.uuid4().hex}.{ext}"
    try:
        storage.upload(path, data, file.mimetype or "application/octet-stream")
    except storage.StorageError as e:
        logger.error("production data document upload failed: %s", e)
        return jsonify({"error": "upload failed"}), 502

    created = sb.insert(TABLE, {
        "account_id": acct, "commodity": commodity, "label": label, "category": category,
        "file_path": path, "content_type": file.mimetype or None, "size_bytes": len(data),
    })
    return jsonify({"success": True, "document": _document_json(created)})


@production_data_documents_bp.route("/api/production-data/<commodity>/documents/<document_id>", methods=["DELETE"])
@requires_auth
def delete_production_data_document(commodity, document_id):
    acct, err = _require_producer()
    if err:
        return err
    rows = sb.select(TABLE, {
        "id": f"eq.{document_id}", "account_id": f"eq.{acct}", "commodity": f"eq.{commodity}",
        "select": "file_path", "limit": 1,
    })
    if not rows:
        return jsonify({"error": "document not found"}), 404
    try:
        storage.delete(rows[0]["file_path"])
    except storage.StorageError as e:
        logger.warning("production data document delete failed (continuing): %s", e)
    sb.delete(TABLE, {"id": f"eq.{document_id}"})
    return jsonify({"success": True})
