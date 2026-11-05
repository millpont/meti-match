"""Service Provider marketplace (Phase 10 Pass 2) — a directory of providers, plus a
request -> accept/decline flow between them and Grower/Buyer/Operator accounts. Mirrors
representations_routes.py (the closest existing analog: a request/approve relationship between
two account types), with two deliberate differences:

  1. Multiple requester roles, not one hardcoded role each side — a service is useful to growers,
     buyers, and program operators alike (00-overview.md's "offers services to the industry"),
     not just one role.
  2. Declines are kept on file (status='declined'), not deleted. buyer_representations deletes a
     declined row because it's a toggleable standing relationship; a service request is a one-off
     inquiry (mirrors offers.grower_approval_status keeping 'declined' on file) — a requester can
     see what happened and isn't blocked from asking that provider again later.

No scoring/matching engine (unlike matching_routes.py) — generic services have no delivery-
window/attribute data to score against. "Match" here just means the request/accept connection.
"""
import logging
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, session

import sb
import reputation
from auth import requires_auth
from profile_routes import photo_url
from notifications_routes import notify
from business_verification import require_verified

logger = logging.getLogger(__name__)
service_requests_bp = Blueprint("service_requests", __name__)

TABLE = "service_requests"
MESSAGES_TABLE = "service_request_messages"
REQUESTER_ROLES = ("grower", "international_buyer", "program_operator")
VALID_STATUSES = ("pending", "accepted", "declined")
# Mirrors responses_routes.py's CHATTABLE_STATUSES — chat only opens once the provider accepts;
# a still-pending or declined request has nothing to discuss yet (see module docstring).
CHATTABLE_STATUSES = ("accepted",)


def _now():
    return datetime.now(timezone.utc).isoformat()


def _require_requester():
    acct = session.get("account_id")
    if not acct:
        return None, (jsonify({"error": "no account access"}), 403)
    if session.get("role") not in REQUESTER_ROLES:
        return None, (jsonify({"error": "only growers, buyers, and program operators can request services"}), 403)
    return str(acct), None


def _require_service_provider():
    acct = session.get("account_id")
    if not acct:
        return None, (jsonify({"error": "no account access"}), 403)
    if session.get("role") != "service_provider":
        return None, (jsonify({"error": "only service providers manage service requests"}), 403)
    return str(acct), None


def _service_request_json(row):
    d = dict(row)
    d["id"] = str(d["id"])
    d["requester_account_id"] = str(d["requester_account_id"])
    d["service_provider_account_id"] = str(d["service_provider_account_id"])
    return d


@service_requests_bp.route("/api/service-providers", methods=["GET"])
@requires_auth
def browse_service_providers():
    """The provider directory — filterable by service category and state. Shows every
    service_provider account, including ones that haven't filled out services_offered/
    states_covered yet (an empty profile still means a real account to work with), narrowed only
    when a filter is actually applied."""
    acct, err = _require_requester()
    if err:
        return err
    categories = [c.strip() for c in request.args.get("service_categories", "").split(",") if c.strip()]
    states = [s.strip().upper() for s in request.args.get("states", "").split(",") if s.strip()]

    accounts = sb.select("accounts", {"role": "eq.service_provider", "select": "id,name,bio,photo_path", "order": "name.asc"})
    if not accounts:
        return jsonify({"success": True, "providers": []})
    ids = [str(a["id"]) for a in accounts]
    sp_rows = sb.select("service_provider_profiles", {
        "account_id": f"in.({','.join(ids)})", "select": "account_id,services_offered,states_covered",
    })
    sp_by_id = {str(r["account_id"]): r for r in sp_rows}

    out = []
    for a in accounts:
        aid = str(a["id"])
        sp = sp_by_id.get(aid, {})
        services_offered = sp.get("services_offered") or []
        states_covered = sp.get("states_covered") or []
        if categories and not (set(services_offered) & set(categories)):
            continue
        if states and not ({s.upper() for s in states_covered} & set(states)):
            continue
        out.append({
            "account_id": aid,
            "name": a.get("name"),
            "photo_url": photo_url(a.get("photo_path")),
            "bio": a.get("bio"),
            "services_offered": services_offered,
            "states_covered": states_covered,
            "reputation": reputation.score_for_account(aid),
        })
    return jsonify({"success": True, "providers": out})


@service_requests_bp.route("/api/service-requests", methods=["POST"])
@requires_auth
def create_service_request():
    acct, err = _require_requester()
    if err:
        return err
    data = request.get_json() or {}
    provider_id = data.get("service_provider_account_id")
    if not provider_id:
        return jsonify({"error": "service_provider_account_id is required"}), 400

    provider_rows = sb.select("accounts", {"id": f"eq.{provider_id}", "select": "role,name", "limit": 1})
    if not provider_rows or provider_rows[0].get("role") != "service_provider":
        return jsonify({"error": "service provider not found"}), 404

    # Only blocks a second PENDING request to the same provider — unlike buyer_representations,
    # re-requesting after an accept or decline is allowed (see module docstring).
    existing = sb.select(TABLE, {
        "requester_account_id": f"eq.{acct}", "service_provider_account_id": f"eq.{provider_id}",
        "status": "eq.pending", "select": "id", "limit": 1,
    })
    if existing:
        return jsonify({"error": "you already have a pending request with this provider"}), 400

    created = sb.insert(TABLE, {
        "requester_account_id": acct, "service_provider_account_id": provider_id,
        "service_category": (data.get("service_category") or "").strip() or None,
        "message": (data.get("message") or "").strip() or None,
        "status": "pending",
    })
    requester_rows = sb.select("accounts", {"id": f"eq.{acct}", "select": "name", "limit": 1})
    requester_name = requester_rows[0]["name"] if requester_rows else "Someone"
    notify(
        provider_id, "service_request_requested",
        title=f"{requester_name} requested a service from you",
        body=created.get("message"),
        link_type="service_request", link_id=created["id"],
    )
    return jsonify({"success": True, "request": _service_request_json(created)})


@service_requests_bp.route("/api/service-requests/mine", methods=["GET"])
@requires_auth
def my_service_requests():
    """A requester's own view: pending, accepted, and declined requests they've sent."""
    acct, err = _require_requester()
    if err:
        return err
    rows = sb.select(TABLE, {"requester_account_id": f"eq.{acct}", "order": "created_at.desc", "select": "*"})
    sp_ids = {str(r["service_provider_account_id"]) for r in rows}
    names = {}
    if sp_ids:
        for a in sb.select("accounts", {"id": f"in.({','.join(sp_ids)})", "select": "id,name"}):
            names[str(a["id"])] = a.get("name")
    out = []
    for r in rows:
        d = _service_request_json(r)
        d["service_provider_name"] = names.get(d["service_provider_account_id"])
        out.append(d)
    return jsonify({"success": True, "requests": out})


@service_requests_bp.route("/api/service-requests/pending", methods=["GET"])
@requires_auth
def pending_service_requests():
    """A provider's inbox: requests awaiting their accept/decline by default (?status=accepted
    also lets the same inbox show already-accepted requests, so a provider can get back to their
    chat with that requester)."""
    acct, err = _require_service_provider()
    if err:
        return err
    status = request.args.get("status", "pending")
    if status not in VALID_STATUSES:
        return jsonify({"error": f"status must be one of {VALID_STATUSES}"}), 400
    rows = sb.select(TABLE, {
        "service_provider_account_id": f"eq.{acct}", "status": f"eq.{status}",
        "order": "created_at.desc", "select": "*",
    })
    requester_ids = {str(r["requester_account_id"]) for r in rows}
    names = {}
    if requester_ids:
        for a in sb.select("accounts", {"id": f"in.({','.join(requester_ids)})", "select": "id,name"}):
            names[str(a["id"])] = a.get("name")
    out = []
    for r in rows:
        d = _service_request_json(r)
        d["requester_name"] = names.get(d["requester_account_id"])
        out.append(d)
    return jsonify({"success": True, "requests": out})


def _owned_pending_request(request_id, acct):
    rows = sb.select(TABLE, {"id": f"eq.{request_id}", "select": "*", "limit": 1})
    if not rows:
        return None, (jsonify({"error": "not found"}), 404)
    row = rows[0]
    if str(row.get("service_provider_account_id")) != acct:
        return None, (jsonify({"error": "not your request to act on"}), 403)
    if row["status"] != "pending":
        return None, (jsonify({"error": "this request is not pending"}), 400)
    return row, None


@service_requests_bp.route("/api/service-requests/<request_id>/accept", methods=["PATCH"])
@requires_auth
def accept_service_request(request_id):
    acct, err = _require_service_provider()
    if err:
        return err
    row, owned_err = _owned_pending_request(request_id, acct)
    if owned_err:
        return owned_err
    unverified = require_verified(acct, session.get("role"), "accept a service request")
    if unverified:
        return unverified
    sb.update(TABLE, {"id": f"eq.{request_id}"}, {"status": "accepted", "updated_at": _now()})
    notify(
        row["requester_account_id"], "service_request_accepted",
        title="Your service request was accepted",
        link_type="service_request", link_id=request_id,
    )
    return jsonify({"success": True})


@service_requests_bp.route("/api/service-requests/<request_id>/decline", methods=["PATCH"])
@requires_auth
def decline_service_request(request_id):
    acct, err = _require_service_provider()
    if err:
        return err
    row, owned_err = _owned_pending_request(request_id, acct)
    if owned_err:
        return owned_err
    sb.update(TABLE, {"id": f"eq.{request_id}"}, {"status": "declined", "updated_at": _now()})
    notify(
        row["requester_account_id"], "service_request_declined",
        title="Your service request was declined",
    )
    return jsonify({"success": True})


@service_requests_bp.route("/api/service-requests/<request_id>", methods=["DELETE"])
@requires_auth
def cancel_service_request(request_id):
    """The requester cancels their own still-pending request — deletes the row (unlike a
    decline, nothing happened on the provider's side, so there's nothing worth keeping on file)."""
    acct, err = _require_requester()
    if err:
        return err
    rows = sb.select(TABLE, {"id": f"eq.{request_id}", "select": "requester_account_id,status", "limit": 1})
    if not rows:
        return jsonify({"error": "not found"}), 404
    row = rows[0]
    if str(row.get("requester_account_id")) != acct:
        return jsonify({"error": "not your request"}), 403
    if row["status"] != "pending":
        return jsonify({"error": "only a pending request can be cancelled"}), 400
    sb.delete(TABLE, {"id": f"eq.{request_id}"})
    return jsonify({"success": True})


def _authorize_request(request_id, acct):
    """Returns (request_row, error). The two participants are the requester and the service
    provider — either may read/send messages, mirrors responses_routes.py's
    _authorize_response."""
    rows = sb.select(TABLE, {"id": f"eq.{request_id}", "select": "*", "limit": 1})
    if not rows:
        return None, (jsonify({"error": "not found"}), 404)
    row = rows[0]
    if acct not in (str(row["requester_account_id"]), str(row["service_provider_account_id"])):
        return None, (jsonify({"error": "not a participant on this request"}), 403)
    return row, None


@service_requests_bp.route("/api/service-requests/<request_id>/messages", methods=["GET"])
@requires_auth
def list_service_request_messages(request_id):
    acct = session.get("account_id")
    if not acct:
        return jsonify({"error": "no account access"}), 403
    acct = str(acct)
    _row, err = _authorize_request(request_id, acct)
    if err:
        return err
    msgs = sb.select(MESSAGES_TABLE, {
        "request_id": f"eq.{request_id}", "order": "created_at.asc",
        "select": "id,sender_account_id,body,created_at",
    })
    ids = {str(m["sender_account_id"]) for m in msgs}
    names = {}
    if ids:
        rows_a = sb.select("accounts", {"id": f"in.({','.join(ids)})", "select": "id,name"})
        names = {str(x["id"]): (x.get("name") or "").strip() for x in rows_a}
    out = [{
        "id": str(m["id"]),
        "sender_account_id": str(m["sender_account_id"]),
        "sender_name": names.get(str(m["sender_account_id"]), "—"),
        "is_mine": str(m["sender_account_id"]) == acct,
        "body": m["body"],
        "created_at": m["created_at"],
    } for m in msgs]
    return jsonify({"success": True, "messages": out})


@service_requests_bp.route("/api/service-requests/<request_id>/messages", methods=["POST"])
@requires_auth
def post_service_request_message(request_id):
    acct = session.get("account_id")
    if not acct:
        return jsonify({"error": "no account access"}), 403
    acct = str(acct)
    body = ((request.get_json() or {}).get("body") or "").strip()
    if not body:
        return jsonify({"error": "message body is required"}), 400
    if len(body) > 4000:
        return jsonify({"error": "message is too long (4000 char max)"}), 400
    row, err = _authorize_request(request_id, acct)
    if err:
        return err
    if row["status"] not in CHATTABLE_STATUSES:
        return jsonify({"error": "the service provider must accept this request before messaging"}), 400
    sb.insert(MESSAGES_TABLE, {
        "request_id": request_id, "sender_account_id": acct, "body": body,
    }, return_representation=False)

    requester = str(row["requester_account_id"])
    provider = str(row["service_provider_account_id"])
    recipient = provider if acct == requester else requester
    notify(
        recipient, "message_received",
        title="New message about your service request",
        body=body[:200], link_type="service_request", link_id=request_id,
    )
    return jsonify({"success": True})
