""""Don't see an attribute you need?" — any authenticated user can propose a new
attribute/practice/certification/data-requirement term from wherever they're picking one (see
frontend/src/AttributeRequestLink.tsx). A superadmin reviews the request from the admin
dashboard, either adding it to the real taxonomy (taxonomy_routes.py) or dismissing it. See
migrations/0027_attribute_requests_and_data_requirements.sql.
"""
import logging

from flask import Blueprint, request, jsonify, session

import sb
from auth import requires_auth, is_superadmin
from config import config
from notifications_routes import notify

logger = logging.getLogger(__name__)
attribute_requests_bp = Blueprint("attribute_requests", __name__)

TABLE = "attribute_requests"


def _require_admin():
    if not is_superadmin():
        return jsonify({"error": "admin only"}), 403
    return None


def _request_json(row):
    d = dict(row)
    d["id"] = str(d["id"])
    d["requested_by_account_id"] = str(d["requested_by_account_id"])
    return d


def _notify_superadmins(title, body, link_id):
    """Fans a notification out to every role='admin' account plus the SUPERADMIN_ACCOUNT_ID
    bootstrap account (which may not hold role='admin' yet) — mirrors admin_routes.py's
    _notify_dispute_parties, just over a computed set of admin accounts instead of two fixed
    contract parties."""
    admin_ids = {str(a["id"]) for a in sb.select("accounts", {"role": "eq.admin", "select": "id"})}
    if config.SUPERADMIN_ACCOUNT_ID:
        admin_ids.add(str(config.SUPERADMIN_ACCOUNT_ID))
    for account_id in admin_ids:
        notify(account_id, "attribute_request_received", title=title, body=body, link_type="attribute_request", link_id=link_id)


@attribute_requests_bp.route("/api/attribute-requests", methods=["POST"])
@requires_auth
def create_attribute_request():
    acct = session.get("account_id")
    if not acct:
        return jsonify({"error": "no account access"}), 403
    data = request.get_json() or {}
    req_type = (data.get("type") or "").strip()
    name = (data.get("name") or "").strip()
    description = (data.get("description") or "").strip() or None
    if not req_type or not name:
        return jsonify({"error": "type and name are required"}), 400

    created = sb.insert(TABLE, {
        "requested_by_account_id": acct, "type": req_type, "name": name, "description": description,
    })
    company = session.get("account_name") or "Someone"
    _notify_superadmins(
        title=f'{company} requested a new {req_type}: "{name}"',
        body=description,
        link_id=created["id"],
    )
    return jsonify({"success": True, "request": _request_json(created)})


@attribute_requests_bp.route("/api/admin/attribute-requests", methods=["GET"])
@requires_auth
def list_attribute_requests():
    err = _require_admin()
    if err:
        return err
    rows = sb.select(TABLE, {"status": "eq.pending", "order": "created_at.desc", "select": "*"})
    ids = {str(r["requested_by_account_id"]) for r in rows}
    names = {}
    if ids:
        for a in sb.select("accounts", {"id": f"in.({','.join(ids)})", "select": "id,name"}):
            names[str(a["id"])] = a.get("name")
    out = []
    for r in rows:
        d = _request_json(r)
        d["requested_by_name"] = names.get(d["requested_by_account_id"])
        out.append(d)
    return jsonify({"success": True, "requests": out})


@attribute_requests_bp.route("/api/admin/attribute-requests/<request_id>/dismiss", methods=["PATCH"])
@requires_auth
def dismiss_attribute_request(request_id):
    err = _require_admin()
    if err:
        return err
    sb.update(TABLE, {"id": f"eq.{request_id}"}, {"status": "dismissed"})
    return jsonify({"success": True})


@attribute_requests_bp.route("/api/admin/attribute-requests/<request_id>/mark-added", methods=["PATCH"])
@requires_auth
def mark_attribute_request_added(request_id):
    """Called after the superadmin has separately created the real taxonomy term (see
    TaxonomyTable.tsx's "Add to taxonomy" action, which calls adminCreateTaxonomyTerm then this)
    — keeps this module decoupled from taxonomy_routes.py rather than creating the term itself."""
    err = _require_admin()
    if err:
        return err
    sb.update(TABLE, {"id": f"eq.{request_id}"}, {"status": "added"})
    return jsonify({"success": True})
