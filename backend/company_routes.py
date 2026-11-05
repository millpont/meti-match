"""Company-level admin approval of new logins joining an already-onboarded company — the other
half of migrations/0024_company_join_requests.sql (the request side lives in
onboarding_routes.py's /api/onboarding/join). The first person to register a company becomes its
admin (auth0_users.is_company_admin); they can approve or decline later logins asking to join
under one of the company's existing roles. A superadmin can act on any company's requests too
(see admin_routes.py's mirror of the approve/decline endpoints below)."""
import logging
from datetime import datetime, timezone

from flask import Blueprint, jsonify, session

import sb
from auth import requires_auth, is_superadmin
from db import is_company_admin_for_auth0
from notifications_routes import notify

logger = logging.getLogger(__name__)
company_bp = Blueprint("company", __name__)

TABLE = "account_join_requests"


def _now():
    return datetime.now(timezone.utc).isoformat()


def _require_company_admin():
    acct = session.get("account_id")
    if not acct:
        return None, (jsonify({"error": "no account access"}), 403)
    # Checked fresh against the DB rather than a session-cached flag — this can flip (a
    # backfill, or a superadmin promoting someone) without the user logging back in.
    if not is_company_admin_for_auth0(session["profile"]["user_id"]) and not is_superadmin():
        return None, (jsonify({"error": "only a company admin can manage join requests"}), 403)
    return str(acct), None


def _request_json(row):
    d = dict(row)
    d["id"] = str(d["id"])
    d["account_id"] = str(d["account_id"])
    return d


def _requesters(auth0_ids):
    """auth0_id -> {name, email} — an admin approving a join request needs the email to
    actually verify who's asking, not just a display name (which is self-reported, unverified
    Auth0 profile data and can collide across companies)."""
    auth0_ids = {i for i in auth0_ids if i}
    if not auth0_ids:
        return {}
    ids_list = ",".join(f'"{i}"' for i in auth0_ids)
    out = {}
    for u in sb.select("auth0_users", {"auth0_id": f"in.({ids_list})", "select": "auth0_id,email,first_name,last_name"}):
        name = f"{u.get('first_name', '')} {u.get('last_name', '')}".strip()
        out[u["auth0_id"]] = {"name": name or None, "email": u.get("email")}
    return out


def apply_approval(row, decided_by_account_id):
    """Link the requester's login to the company, ensure they hold the requested role (it must
    already exist on the account — request_join() only offers roles the company already has),
    and notify. Shared by this blueprint's own endpoint and admin_routes.py's superadmin one."""
    sb.update("auth0_users", {"auth0_id": f"eq.{row['auth0_id']}"}, {"account_id": row["account_id"]})
    sb.update(TABLE, {"id": f"eq.{row['id']}"}, {
        "status": "approved", "decided_at": _now(), "decided_by_account_id": decided_by_account_id,
    })
    notify(
        row["account_id"], "join_request_approved",
        title="A new login was approved to join your company",
        body=f"They now have access as {row['role'].replace('_', ' ')}.",
        link_type="join_request", link_id=row["id"],
    )


def apply_decline(row, decided_by_account_id):
    # The requester's login never got account_id set, so they have no account to notify against
    # yet — /api/me's pending_join_request surfaces the decline directly to them instead.
    sb.update(TABLE, {"id": f"eq.{row['id']}"}, {
        "status": "declined", "decided_at": _now(), "decided_by_account_id": decided_by_account_id,
    })


@company_bp.route("/api/company/join-requests", methods=["GET"])
@requires_auth
def list_join_requests():
    acct, err = _require_company_admin()
    if err:
        return err
    rows = sb.select(TABLE, {
        "account_id": f"eq.{acct}", "status": "eq.pending", "order": "created_at.desc", "select": "*",
    })
    requesters = _requesters(r["auth0_id"] for r in rows)
    out = []
    for r in rows:
        d = _request_json(r)
        who = requesters.get(r["auth0_id"], {})
        d["requester_name"] = who.get("name")
        d["requester_email"] = who.get("email")
        out.append(d)
    return jsonify({"success": True, "requests": out})


def _owned_pending(request_id, acct):
    rows = sb.select(TABLE, {"id": f"eq.{request_id}", "select": "*", "limit": 1})
    if not rows:
        return None, (jsonify({"error": "not found"}), 404)
    row = rows[0]
    if not is_superadmin() and str(row["account_id"]) != acct:
        return None, (jsonify({"error": "not your company's request"}), 403)
    if row["status"] != "pending":
        return None, (jsonify({"error": "this request is not pending"}), 400)
    return row, None


@company_bp.route("/api/company/join-requests/<request_id>/approve", methods=["PATCH"])
@requires_auth
def approve_join_request(request_id):
    acct, err = _require_company_admin()
    if err:
        return err
    row, owned_err = _owned_pending(request_id, acct)
    if owned_err:
        return owned_err
    apply_approval(row, acct)
    return jsonify({"success": True})


@company_bp.route("/api/company/join-requests/<request_id>/decline", methods=["PATCH"])
@requires_auth
def decline_join_request(request_id):
    acct, err = _require_company_admin()
    if err:
        return err
    row, owned_err = _owned_pending(request_id, acct)
    if owned_err:
        return owned_err
    apply_decline(row, acct)
    return jsonify({"success": True})
