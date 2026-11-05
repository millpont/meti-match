"""A Service Provider (Trader) requests to represent a Buyer; the buyer approves
or declines. Mirrors enrollments_routes.py's grower-initiated program affiliation almost exactly,
just for the buyer side of the Trader role's two capabilities:

  1. Contract (bid) on behalf of that buyer, with their approval (see bids_routes.py's
     on_behalf_of_buyer_account_id handling).
  2. Manage the execution of that buyer's agreements (see contracts_routes.py, which extends
     visibility/status-management to a service provider for any contract where buyer_account_id
     is one of their actively-represented buyers).

Unlike a grower's program affiliation, there's no "at most one" cap here — a buyer may work with
several trading houses, and a trader may represent several buyers."""
import logging

from flask import Blueprint, request, jsonify, session

import sb
from auth import requires_auth
from notifications_routes import notify

logger = logging.getLogger(__name__)
representations_bp = Blueprint("representations", __name__)

TABLE = "buyer_representations"


def _require_service_provider():
    acct = session.get("account_id")
    if not acct:
        return None, (jsonify({"error": "no account access"}), 403)
    if session.get("role") != "service_provider":
        return None, (jsonify({"error": "only service providers manage buyer representation"}), 403)
    not_trader = require_trader(acct, "service_provider")
    if not_trader:
        return None, not_trader
    return str(acct), None


def is_trader(account_id):
    """A Service Provider is a technical-services provider unless they've opted in as a Trader
    (service_provider_profiles.is_trader) — only Traders bid, represent buyers and see agreements."""
    rows = sb.select("service_provider_profiles", {
        "account_id": f"eq.{account_id}", "select": "is_trader", "limit": 1,
    })
    return bool(rows and rows[0].get("is_trader"))


def require_trader(acct, role):
    """None when the caller may trade; a 403 response for a non-Trader Service Provider. Other
    roles pass through — their own role checks apply."""
    if role != "service_provider" or is_trader(acct):
        return None
    return jsonify({
        "error": "Only Service Providers registered as Traders can do this — turn on \"I'm a Trader\" in your Profile.",
        "code": "trader_only",
    }), 403


def _require_buyer():
    acct = session.get("account_id")
    if not acct:
        return None, (jsonify({"error": "no account access"}), 403)
    if session.get("role") != "international_buyer":
        return None, (jsonify({"error": "only buyers manage representation requests"}), 403)
    return str(acct), None


def _representation_json(row):
    d = dict(row)
    d["id"] = str(d["id"])
    d["service_provider_account_id"] = str(d["service_provider_account_id"])
    d["buyer_account_id"] = str(d["buyer_account_id"])
    return d


def active_represented_buyer_ids(service_provider_account_id):
    """Buyer account ids this service provider actively represents — used by contracts_routes.py
    to extend a Trader's agreement visibility/management rights to their represented buyers'
    contracts, and by bids_routes.py to gate on-behalf-of bid creation."""
    rows = sb.select(TABLE, {
        "service_provider_account_id": f"eq.{service_provider_account_id}", "status": "eq.active",
        "select": "buyer_account_id",
    })
    return {str(r["buyer_account_id"]) for r in rows}


@representations_bp.route("/api/international-buyers", methods=["GET"])
@requires_auth
def list_international_buyers():
    """Any authenticated user — populates the Trader's "request to represent" picker. Just id +
    name, nothing sensitive (mirrors enrollments_routes.py's list_program_operators)."""
    rows = sb.select("accounts", {"role": "eq.international_buyer", "select": "id,name", "order": "name.asc"})
    return jsonify({"success": True, "buyers": [{"id": str(r["id"]), "name": r["name"]} for r in rows]})


@representations_bp.route("/api/buyer-representations/request", methods=["POST"])
@requires_auth
def request_representation():
    acct, err = _require_service_provider()
    if err:
        return err
    buyer_account_id = (request.get_json() or {}).get("buyer_account_id")
    if not buyer_account_id:
        return jsonify({"error": "buyer_account_id is required"}), 400

    buyer_rows = sb.select("accounts", {"id": f"eq.{buyer_account_id}", "select": "role,name", "limit": 1})
    if not buyer_rows or buyer_rows[0].get("role") != "international_buyer":
        return jsonify({"error": "buyer not found"}), 404

    existing = sb.select(TABLE, {
        "service_provider_account_id": f"eq.{acct}", "buyer_account_id": f"eq.{buyer_account_id}",
        "select": "id,status", "limit": 1,
    })
    if existing:
        return jsonify({"error": f"you already have a {existing[0]['status']} representation request with this buyer"}), 400

    created = sb.insert(TABLE, {
        "service_provider_account_id": acct, "buyer_account_id": buyer_account_id, "status": "pending",
    })
    trader_name = sb.select("accounts", {"id": f"eq.{acct}", "select": "name", "limit": 1})
    notify(
        buyer_account_id, "representation_requested",
        title=f"{(trader_name[0]['name'] if trader_name else 'A service provider')} wants to represent you",
        body="They'll be able to place bids on your behalf and manage your agreements once approved.",
        link_type="representation", link_id=created["id"],
    )
    return jsonify({"success": True, "representation": _representation_json(created)})


@representations_bp.route("/api/buyer-representations/mine", methods=["GET"])
@requires_auth
def my_representations():
    """A trader's own view: who they represent (active) or have asked to represent (pending)."""
    acct, err = _require_service_provider()
    if err:
        return err
    rows = sb.select(TABLE, {"service_provider_account_id": f"eq.{acct}", "order": "created_at.desc", "select": "*"})
    buyer_ids = {str(r["buyer_account_id"]) for r in rows}
    names = {}
    if buyer_ids:
        for a in sb.select("accounts", {"id": f"in.({','.join(buyer_ids)})", "select": "id,name"}):
            names[str(a["id"])] = a.get("name")
    out = []
    for r in rows:
        d = _representation_json(r)
        d["buyer_name"] = names.get(d["buyer_account_id"])
        out.append(d)
    return jsonify({"success": True, "representations": out})


@representations_bp.route("/api/buyer-representations/active-buyers", methods=["GET"])
@requires_auth
def active_buyers_for_bids():
    """Buyers this trader actively represents, for CreateRfqForm's on-behalf-of picker."""
    acct, err = _require_service_provider()
    if err:
        return err
    buyer_ids = active_represented_buyer_ids(acct)
    if not buyer_ids:
        return jsonify({"success": True, "buyers": []})
    rows = sb.select("accounts", {"id": f"in.({','.join(buyer_ids)})", "select": "id,name", "order": "name.asc"})
    return jsonify({"success": True, "buyers": [{"id": str(r["id"]), "name": r["name"]} for r in rows]})


@representations_bp.route("/api/buyer-representations/<representation_id>", methods=["DELETE"])
@requires_auth
def cancel_representation_request(representation_id):
    """A trader can cancel their own PENDING request. Ending an already-active representation
    isn't supported yet — same scope boundary as enrollments_routes.py's affiliation cancel."""
    acct, err = _require_service_provider()
    if err:
        return err
    rows = sb.select(TABLE, {"id": f"eq.{representation_id}", "select": "service_provider_account_id,status", "limit": 1})
    if not rows:
        return jsonify({"error": "not found"}), 404
    row = rows[0]
    if str(row.get("service_provider_account_id")) != acct:
        return jsonify({"error": "not your request"}), 403
    if row["status"] != "pending":
        return jsonify({"error": "only a pending request can be cancelled"}), 400
    sb.delete(TABLE, {"id": f"eq.{representation_id}"})
    return jsonify({"success": True})


@representations_bp.route("/api/buyer-representations/pending", methods=["GET"])
@requires_auth
def pending_representation_requests():
    """A buyer's view: trader requests awaiting their approval."""
    acct, err = _require_buyer()
    if err:
        return err
    rows = sb.select(TABLE, {"buyer_account_id": f"eq.{acct}", "status": "eq.pending", "order": "created_at.desc", "select": "*"})
    sp_ids = {str(r["service_provider_account_id"]) for r in rows}
    names = {}
    if sp_ids:
        for a in sb.select("accounts", {"id": f"in.({','.join(sp_ids)})", "select": "id,name"}):
            names[str(a["id"])] = a.get("name")
    out = []
    for r in rows:
        d = _representation_json(r)
        d["service_provider_name"] = names.get(d["service_provider_account_id"])
        out.append(d)
    return jsonify({"success": True, "representations": out})


def _owned_pending_request(representation_id, acct):
    rows = sb.select(TABLE, {"id": f"eq.{representation_id}", "select": "*", "limit": 1})
    if not rows:
        return None, (jsonify({"error": "not found"}), 404)
    row = rows[0]
    if str(row.get("buyer_account_id")) != acct:
        return None, (jsonify({"error": "not your representation request"}), 403)
    if row["status"] != "pending":
        return None, (jsonify({"error": "this request is not pending"}), 400)
    return row, None


@representations_bp.route("/api/buyer-representations/<representation_id>/approve", methods=["PATCH"])
@requires_auth
def approve_representation(representation_id):
    acct, err = _require_buyer()
    if err:
        return err
    row, owned_err = _owned_pending_request(representation_id, acct)
    if owned_err:
        return owned_err
    sb.update(TABLE, {"id": f"eq.{representation_id}"}, {"status": "active"})
    notify(
        row["service_provider_account_id"], "representation_approved",
        title="Your buyer representation request was approved",
        link_type="representation", link_id=representation_id,
    )
    return jsonify({"success": True})


@representations_bp.route("/api/buyer-representations/<representation_id>/decline", methods=["PATCH"])
@requires_auth
def decline_representation(representation_id):
    acct, err = _require_buyer()
    if err:
        return err
    row, owned_err = _owned_pending_request(representation_id, acct)
    if owned_err:
        return owned_err
    sb.delete(TABLE, {"id": f"eq.{representation_id}"})
    notify(
        row["service_provider_account_id"], "representation_declined",
        title="Your buyer representation request was declined",
    )
    return jsonify({"success": True})
