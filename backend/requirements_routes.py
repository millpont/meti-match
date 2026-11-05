"""A buyer's standing requirements profile (page 13's "My Requirements") — distinct from a
specific posted bid; drives what supply looks like a match. See
plans/meti-match/02-data-model.md / 03-api-plan.md."""
import logging

from flask import Blueprint, request, jsonify, session

import sb
from auth import requires_auth

logger = logging.getLogger(__name__)
requirements_bp = Blueprint("requirements", __name__)

TABLE = "buyer_requirements"


def _require_buyer():
    acct = session.get("account_id")
    if not acct:
        return None, (jsonify({"error": "no account access"}), 403)
    if session.get("role") != "international_buyer":
        return None, (jsonify({"error": "only buyers have requirements"}), 403)
    return str(acct), None


def _num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _as_list(v):
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def _requirements_json(row):
    if not row:
        return None
    d = dict(row)
    d["volumes_min"] = _num(d.get("volumes_min"))
    d["volumes_max"] = _num(d.get("volumes_max"))
    return d


@requirements_bp.route("/api/buyer-requirements", methods=["GET"])
@requires_auth
def get_requirements():
    acct, err = _require_buyer()
    if err:
        return err
    rows = sb.select(TABLE, {"account_id": f"eq.{acct}", "select": "*", "limit": 1})
    return jsonify({"success": True, "requirements": _requirements_json(rows[0] if rows else None)})


@requirements_bp.route("/api/buyer-requirements", methods=["PUT"])
@requires_auth
def put_requirements():
    acct, err = _require_buyer()
    if err:
        return err
    data = request.get_json() or {}
    row = {
        "account_id": acct,
        "volumes_min": _num(data.get("volumes_min")),
        "volumes_max": _num(data.get("volumes_max")),
        "commodities": _as_list(data.get("commodities")),
        "attributes": _as_list(data.get("attributes")),
        "practices": _as_list(data.get("practices")),
        "traceability_required": bool(data.get("traceability_required")),
        "certification_required": _as_list(data.get("certification_required")),
        "production_data_required": bool(data.get("production_data_required")),
    }
    sb.upsert(TABLE, row)
    rows = sb.select(TABLE, {"account_id": f"eq.{acct}", "select": "*", "limit": 1})
    return jsonify({"success": True, "requirements": _requirements_json(rows[0] if rows else None)})
