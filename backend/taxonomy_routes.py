"""Superadmin-managed vocabulary for the term families used across offer/bid/requirement
pickers: attributes, practices, certifications, and data requirements. Previously hardcoded
string arrays with no definitions (frontend/src/*/constants.ts); now a real table (see
migrations/0016_taxonomy_terms.sql) so Superadmin can add/edit terms and their definitions, and
every picker in the app shows each term's definition as a hover tooltip.

"data_requirement" (added in migrations/0027_attribute_requests_and_data_requirements.sql) is a
buyer's specific data ask on a bid — e.g. "John Deere User ID", "GeoJSON format" — distinct from
a sustainability/quality attribute. It's deliberately NOT read by matching_routes.py's scoring;
per the client's own framing this is a forward-looking field the buyer negotiates over chat
today, not something matched on yet (see bids_routes.py's required_data_requirements).

"service_category" (added in migrations/0037_service_category_taxonomy.sql, Phase 10 Pass 2) is
a Service Provider's offered services (logistics, inspection, financing, etc.) — see
service_provider_profiles.services_offered and service_requests_routes.py.

GET is open to any authenticated account (every role needs these lists to build offers/bids/
requirements); mutations are Superadmin-only.
"""
import logging
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify

import sb
from auth import requires_auth, is_superadmin

logger = logging.getLogger(__name__)
taxonomy_bp = Blueprint("taxonomy", __name__)

TABLE = "taxonomy_terms"
VALID_TYPES = ("attribute", "practice", "certification", "data_requirement", "service_category")
# Only meaningful for type="attribute" (see migrations/0045_taxonomy_attribute_segment.sql) — an
# offer's Sustainability Attributes picker shows only 'sustainability'-segment terms, Specialty
# Attributes only 'specialty'-segment terms, where today both pickers draw from one shared list.
VALID_SEGMENTS = ("specialty", "sustainability")


def _require_admin():
    if not is_superadmin():
        return jsonify({"error": "admin only"}), 403
    return None


def _term_json(row):
    d = dict(row)
    d["id"] = str(d["id"])
    return d


@taxonomy_bp.route("/api/taxonomy", methods=["GET"])
@requires_auth
def list_terms():
    term_type = request.args.get("type")
    if term_type and term_type not in VALID_TYPES:
        return jsonify({"error": f"type must be one of {VALID_TYPES}"}), 400
    params = {"select": "id,type,label,definition,segment", "order": "label.asc"}
    if term_type:
        params["type"] = f"eq.{term_type}"
    rows = sb.select(TABLE, params)
    return jsonify({"success": True, "terms": [_term_json(r) for r in rows]})


@taxonomy_bp.route("/api/admin/taxonomy", methods=["POST"])
@requires_auth
def create_term():
    err = _require_admin()
    if err:
        return err
    data = request.get_json() or {}
    term_type = data.get("type")
    label = (data.get("label") or "").strip()
    definition = (data.get("definition") or "").strip() or None
    segment = data.get("segment") or None
    if term_type not in VALID_TYPES:
        return jsonify({"error": f"type must be one of {VALID_TYPES}"}), 400
    if not label:
        return jsonify({"error": "label is required"}), 400
    if term_type == "attribute":
        if segment not in VALID_SEGMENTS:
            return jsonify({"error": f"segment must be one of {VALID_SEGMENTS} for an attribute term"}), 400
    elif segment is not None:
        return jsonify({"error": "segment only applies to attribute terms"}), 400
    try:
        created = sb.insert(TABLE, {"type": term_type, "label": label, "definition": definition, "segment": segment})
    except sb.SupabaseError as e:
        if "duplicate key" in str(e).lower() or "23505" in str(e):
            return jsonify({"error": f"a {term_type} term named \"{label}\" already exists"}), 400
        raise
    return jsonify({"success": True, "term": _term_json(created)})


@taxonomy_bp.route("/api/admin/taxonomy/<term_id>", methods=["PATCH"])
@requires_auth
def update_term(term_id):
    err = _require_admin()
    if err:
        return err
    data = request.get_json() or {}
    patch = {}
    if "label" in data:
        label = (data.get("label") or "").strip()
        if not label:
            return jsonify({"error": "label cannot be empty"}), 400
        patch["label"] = label
    if "definition" in data:
        patch["definition"] = (data.get("definition") or "").strip() or None
    if "segment" in data:
        segment = data.get("segment") or None
        if segment is not None and segment not in VALID_SEGMENTS:
            return jsonify({"error": f"segment must be one of {VALID_SEGMENTS}"}), 400
        patch["segment"] = segment
    if not patch:
        return jsonify({"error": "nothing to update"}), 400
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    affected = sb.update(TABLE, {"id": f"eq.{term_id}"}, patch, return_representation=True)
    if not affected:
        return jsonify({"error": "term not found"}), 404
    return jsonify({"success": True, "term": _term_json(affected[0])})


@taxonomy_bp.route("/api/admin/taxonomy/<term_id>", methods=["DELETE"])
@requires_auth
def delete_term(term_id):
    err = _require_admin()
    if err:
        return err
    sb.delete(TABLE, {"id": f"eq.{term_id}"})
    return jsonify({"success": True})
