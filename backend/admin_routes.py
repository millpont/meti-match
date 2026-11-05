"""Admin analytics dashboard + management surfaces (page 17). All routes here require
`accounts.role == 'admin'` (see auth.is_superadmin — role-based now, not a hardcoded account id).

Note on scope vs the original mockup: this repo's `accounts` table already covers what the
mockup treats as two separate concepts ("Users" and "Organizations") — one Auth0 login is one
account is one org here, so there's a single Accounts listing rather than two redundant ones.
"Inventory"/"Payments"/"Notifications"/"Settings" nav items from the mockup have no clear
distinct meaning in this schema (no payment processor exists, etc.) and are left out."""
import logging
from datetime import timedelta

from flask import Blueprint, request, jsonify, session

import sb
import stats
from auth import requires_auth, is_superadmin
from notifications_routes import notify
from company_routes import apply_approval, apply_decline, _requesters

logger = logging.getLogger(__name__)
admin_bp = Blueprint("admin", __name__)

_num = stats.num


def _require_admin():
    if not session.get("account_id"):
        return jsonify({"error": "no account access"}), 403
    # is_superadmin() also honors the SUPERADMIN_ACCOUNT_ID bootstrap fallback (see auth.py) —
    # not just accounts.role == 'admin' — so the very first admin doesn't need a DB edit.
    if not is_superadmin():
        return jsonify({"error": "admin only"}), 403
    return None


def _account_names(ids):
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {str(a["id"]): a.get("name") for a in sb.select("accounts", {"id": f"in.({','.join(ids)})", "select": "id,name"})}


@admin_bp.route("/api/admin/dashboard", methods=["GET"])
@requires_auth
def dashboard():
    err = _require_admin()
    if err:
        return err

    contracts = sb.select("contracts", {"select": "*", "order": "created_at.desc"})
    current_window, prior_window = stats.windowed(contracts)

    dashboard_stats = {
        "total_volume_mt": stats.stat(stats.volume, current_window, prior_window),
        "gmv_usd": stats.stat(stats.gmv, current_window, prior_window),
        "total_transactions": stats.stat(len, current_window, prior_window),
        "active_buyers": stats.stat(lambda cs: stats.distinct(cs, "buyer_account_id"), current_window, prior_window),
        "active_sellers": stats.stat(lambda cs: stats.distinct(cs, "seller_account_id"), current_window, prior_window),
    }

    published_offers = sb.select("offers", {"status": "eq.published", "select": "locations,expected_volume"})
    volume_by_state = {}
    for o in published_offers:
        states = [loc.get("state") for loc in (o.get("locations") or []) if loc.get("state")] or ["Unknown"]
        # A multi-state offer's volume counts toward every state it lists — there's no per-state
        # split of one offer's total, so this is a deliberate over-count across states, not a bug.
        for state in states:
            volume_by_state[state] = volume_by_state.get(state, 0) + (_num(o.get("expected_volume")) or 0)
    volume_by_state_list = sorted(
        [{"state": s, "volume": round(v)} for s, v in volume_by_state.items()],
        key=lambda x: x["volume"], reverse=True,
    )

    recent = contracts[:10]
    names = _account_names({str(c["seller_account_id"]) for c in recent} | {str(c["buyer_account_id"]) for c in recent})
    recent_transactions = [{
        "id": str(c["id"]),
        "commodity": c["commodity"],
        "variety": c.get("variety"),
        "final_volume": _num(c.get("final_volume")),
        "final_price_usd_per_mt": _num(c.get("final_price_usd_per_mt")),
        "seller_name": names.get(str(c["seller_account_id"])),
        "buyer_name": names.get(str(c["buyer_account_id"])),
        "status": c["status"],
        "created_at": c["created_at"],
    } for c in recent]

    return jsonify({
        "success": True,
        "stats": dashboard_stats,
        "volume_by_state": volume_by_state_list,
        "recent_transactions": recent_transactions,
    })


@admin_bp.route("/api/admin/accounts", methods=["GET"])
@requires_auth
def list_accounts():
    err = _require_admin()
    if err:
        return err
    accounts = sb.select("accounts", {
        "select": "id,role,name,created_at,frozen,frozen_reason,contact_name,contact_phone,ein_last4,"
                  "role_switching_enabled,approval_status,approval_note",
        "order": "created_at.desc",
    })
    ids = [str(a["id"]) for a in accounts]
    emails = {}
    if ids:
        for u in sb.select("auth0_users", {"account_id": f"in.({','.join(ids)})", "select": "account_id,email"}):
            if u.get("account_id"):
                emails[str(u["account_id"])] = u.get("email")
    out = []
    for a in accounts:
        d = dict(a)
        d["id"] = str(d["id"])
        d["email"] = emails.get(d["id"])
        out.append(d)
    return jsonify({"success": True, "accounts": out})


@admin_bp.route("/api/admin/accounts/<account_id>/freeze", methods=["PATCH"])
@requires_auth
def freeze_account(account_id):
    """Suspends an account — enforced at their next login (see auth.py's callback), not
    mid-session, matching how this was actually asked for ("when they login if its frozen")."""
    err = _require_admin()
    if err:
        return err
    data = request.get_json() or {}
    frozen = bool(data.get("frozen"))
    if account_id == session.get("account_id") and frozen:
        return jsonify({"error": "cannot freeze your own account"}), 400
    sb.update("accounts", {"id": f"eq.{account_id}"}, {
        "frozen": frozen,
        "frozen_reason": (data.get("reason") or "").strip() or None if frozen else None,
    })
    return jsonify({"success": True, "frozen": frozen})


@admin_bp.route("/api/admin/accounts/<account_id>/approval", methods=["PATCH"])
@requires_auth
def decide_account_approval(account_id):
    """Approve or decline a new account that registered its own company. Dormant unless
    config.ACCOUNT_APPROVAL_REQUIRED is on — with the flag off, nothing is ever created 'pending'
    (see onboarding_routes.py's _create_account_and_link), so this endpoint has nothing to act on
    and the admin UI that calls it stays hidden. Takes effect on the account's next /api/me poll,
    no re-login needed (see auth.py's /api/me)."""
    err = _require_admin()
    if err:
        return err
    data = request.get_json() or {}
    approved = bool(data.get("approved"))
    if account_id == session.get("account_id") and not approved:
        return jsonify({"error": "cannot decline your own account"}), 400
    sb.update("accounts", {"id": f"eq.{account_id}"}, {
        "approval_status": "approved" if approved else "declined",
        "approval_decided_at": stats.now().isoformat(),
        "approval_decided_by_account_id": session.get("account_id"),
        "approval_note": (data.get("note") or "").strip() or None,
    })
    notify(
        account_id,
        "account_approved" if approved else "account_declined",
        title="Your account was approved" if approved else "Your account registration was declined",
        body=(data.get("note") or "").strip() or None,
    )
    return jsonify({"success": True, "approval_status": "approved" if approved else "declined"})


@admin_bp.route("/api/admin/accounts/<account_id>/role-switching", methods=["PATCH"])
@requires_auth
def toggle_role_switching(account_id):
    """Superadmin-only opt-in for an account's ability to add/switch roles at all — see
    migrations/0026_role_switching_toggle.sql. Checked fresh from the DB by
    onboarding_routes.py's add_role/switch_role, so this takes effect immediately, no re-login
    needed."""
    err = _require_admin()
    if err:
        return err
    data = request.get_json() or {}
    enabled = bool(data.get("enabled"))
    sb.update("accounts", {"id": f"eq.{account_id}"}, {"role_switching_enabled": enabled})
    return jsonify({"success": True, "role_switching_enabled": enabled})


@admin_bp.route("/api/admin/join-requests", methods=["GET"])
@requires_auth
def list_join_requests():
    """Every company's pending "join this company" requests — a superadmin backstop for when a
    company has no admin available (or the request predates one). See company_routes.py for the
    per-company admin's own view of just their account's requests."""
    err = _require_admin()
    if err:
        return err
    rows = sb.select("account_join_requests", {"status": "eq.pending", "order": "created_at.desc", "select": "*"})
    account_names = _account_names(str(r["account_id"]) for r in rows)
    requesters = _requesters(r["auth0_id"] for r in rows)
    out = []
    for r in rows:
        d = dict(r)
        d["id"] = str(d["id"])
        d["account_id"] = str(d["account_id"])
        d["account_name"] = account_names.get(d["account_id"])
        who = requesters.get(r["auth0_id"], {})
        d["requester_name"] = who.get("name")
        d["requester_email"] = who.get("email")
        out.append(d)
    return jsonify({"success": True, "requests": out})


@admin_bp.route("/api/admin/join-requests/<request_id>/approve", methods=["PATCH"])
@requires_auth
def admin_approve_join_request(request_id):
    err = _require_admin()
    if err:
        return err
    rows = sb.select("account_join_requests", {"id": f"eq.{request_id}", "select": "*", "limit": 1})
    if not rows:
        return jsonify({"error": "not found"}), 404
    if rows[0]["status"] != "pending":
        return jsonify({"error": "this request is not pending"}), 400
    apply_approval(rows[0], session.get("account_id"))
    return jsonify({"success": True})


@admin_bp.route("/api/admin/join-requests/<request_id>/decline", methods=["PATCH"])
@requires_auth
def admin_decline_join_request(request_id):
    err = _require_admin()
    if err:
        return err
    rows = sb.select("account_join_requests", {"id": f"eq.{request_id}", "select": "*", "limit": 1})
    if not rows:
        return jsonify({"error": "not found"}), 404
    if rows[0]["status"] != "pending":
        return jsonify({"error": "this request is not pending"}), 400
    apply_decline(rows[0], session.get("account_id"))
    return jsonify({"success": True})


@admin_bp.route("/api/admin/listings", methods=["GET"])
@requires_auth
def list_listings():
    err = _require_admin()
    if err:
        return err
    offers = sb.select("offers", {"select": "id,created_by,commodity,variety,expected_volume,uom,status,created_at", "order": "created_at.desc"})
    bids = sb.select("bids", {"select": "id,created_by,commodity,variety,quantity,bid_type,status,created_at", "order": "created_at.desc"})
    ids = {str(o["created_by"]) for o in offers} | {str(b["created_by"]) for b in bids}
    names = _account_names(ids)

    out = []
    for o in offers:
        out.append({
            "id": str(o["id"]), "listing_type": "offer", "created_by_name": names.get(str(o["created_by"])),
            "commodity": o["commodity"], "variety": o.get("variety"),
            "quantity": _num(o.get("expected_volume")), "uom": o.get("uom"),
            "status": o["status"], "created_at": o["created_at"],
        })
    for b in bids:
        out.append({
            "id": str(b["id"]), "listing_type": "bid", "created_by_name": names.get(str(b["created_by"])),
            "commodity": b["commodity"], "variety": b.get("variety"),
            "quantity": _num(b.get("quantity")), "uom": "MT" if b.get("bid_type") != "acres_for_contracting" else "acres",
            "status": b["status"], "created_at": b["created_at"],
        })
    out.sort(key=lambda x: x["created_at"], reverse=True)
    return jsonify({"success": True, "listings": out})


@admin_bp.route("/api/admin/listings/<listing_type>/<listing_id>", methods=["DELETE"])
@requires_auth
def remove_listing(listing_type, listing_id):
    err = _require_admin()
    if err:
        return err
    table = {"offer": "offers", "bid": "bids"}.get(listing_type)
    if not table:
        return jsonify({"error": "listing_type must be 'offer' or 'bid'"}), 400
    affected = sb.delete(table, {"id": f"eq.{listing_id}"}, return_representation=True)
    if not affected:
        return jsonify({"error": "listing not found"}), 404
    return jsonify({"success": True, "removed": True})


@admin_bp.route("/api/admin/disputes", methods=["GET"])
@requires_auth
def list_disputes():
    err = _require_admin()
    if err:
        return err
    disputes = sb.select("disputes", {"select": "*", "order": "created_at.desc"})
    contract_ids = {str(d["contract_id"]) for d in disputes}
    contracts = {}
    if contract_ids:
        for c in sb.select("contracts", {"id": f"in.({','.join(contract_ids)})", "select": "id,commodity,variety,seller_account_id,buyer_account_id"}):
            contracts[str(c["id"])] = c
    names = _account_names(
        {str(d["raised_by_account_id"]) for d in disputes}
        | {str(c["seller_account_id"]) for c in contracts.values()}
        | {str(c["buyer_account_id"]) for c in contracts.values()}
    )

    out = []
    for d in disputes:
        contract = contracts.get(str(d["contract_id"]))
        out.append({
            "id": str(d["id"]),
            "contract_id": str(d["contract_id"]),
            "contract_summary": (
                f"{contract['commodity']}{' — ' + contract['variety'] if contract.get('variety') else ''} "
                f"({names.get(str(contract['seller_account_id']), '—')} → {names.get(str(contract['buyer_account_id']), '—')})"
            ) if contract else "—",
            "raised_by_name": names.get(str(d["raised_by_account_id"])),
            "reason": d["reason"],
            "description": d.get("description"),
            "category": d.get("category", "other"),
            "resolution_track": d.get("resolution_track", "arbitration"),
            "tier": d.get("tier", "tribunal"),
            "filing_deadline": d.get("filing_deadline"),
            "is_time_barred": bool(d.get("is_time_barred")),
            "status": d["status"],
            "resolution_notes": d.get("resolution_notes"),
            "tribunal_resolution_notes": d.get("tribunal_resolution_notes"),
            "created_at": d["created_at"],
            "resolved_at": d.get("resolved_at"),
            "appealed_at": d.get("appealed_at"),
        })
    return jsonify({"success": True, "disputes": out})


def _notify_dispute_parties(dispute_row, notif_type, title):
    contracts = sb.select("contracts", {
        "id": f"eq.{dispute_row['contract_id']}", "select": "seller_account_id,buyer_account_id", "limit": 1,
    })
    if not contracts:
        return
    contract = contracts[0]
    for account_id in (contract["seller_account_id"], contract["buyer_account_id"]):
        notify(account_id, notif_type, title=title, link_type="dispute", link_id=dispute_row["id"])


@admin_bp.route("/api/admin/disputes/<dispute_id>/resolve", methods=["PATCH"])
@requires_auth
def resolve_dispute(dispute_id):
    err = _require_admin()
    if err:
        return err
    notes = (request.get_json() or {}).get("resolution_notes", "")
    affected = sb.update("disputes", {"id": f"eq.{dispute_id}", "status": "eq.open"}, {
        "status": "resolved", "resolution_notes": notes.strip() or None,
        "resolved_at": stats.now().isoformat(),
    }, return_representation=True)
    if not affected:
        return jsonify({"error": "dispute not found or already resolved"}), 404
    _notify_dispute_parties(affected[0], "dispute_resolved", "Your dispute has been resolved")
    return jsonify({"success": True})


# Real GAFTA/FOSFA appeals go to a Board of Appeal, which re-hears the matter on the merits
# (not a narrow review) — modeled here as reopening the dispute at 'board_of_appeal' tier, with
# the original tribunal outcome preserved rather than overwritten. Bounded to 30 days after the
# tribunal resolution, loosely matching how these appeal windows are time-limited in practice.
APPEAL_WINDOW_DAYS = 30


@admin_bp.route("/api/admin/disputes/<dispute_id>/appeal", methods=["PATCH"])
@requires_auth
def appeal_dispute(dispute_id):
    err = _require_admin()
    if err:
        return err
    rows = sb.select("disputes", {"id": f"eq.{dispute_id}", "select": "*", "limit": 1})
    if not rows:
        return jsonify({"error": "dispute not found"}), 404
    row = rows[0]
    if row.get("tier") != "tribunal" or row["status"] != "resolved":
        return jsonify({"error": "only a resolved tribunal-tier dispute can be appealed"}), 400
    resolved_at = row.get("resolved_at")
    if resolved_at:
        from datetime import datetime as _dt
        resolved_dt = _dt.fromisoformat(str(resolved_at).replace("Z", "+00:00"))
        if stats.now() - resolved_dt > timedelta(days=APPEAL_WINDOW_DAYS):
            return jsonify({"error": f"the {APPEAL_WINDOW_DAYS}-day appeal window has passed"}), 400

    sb.update("disputes", {"id": f"eq.{dispute_id}"}, {
        "tier": "board_of_appeal",
        "status": "open",
        "tribunal_resolution_notes": row.get("resolution_notes"),
        "resolution_notes": None,
        "resolved_at": None,
        "appealed_at": stats.now().isoformat(),
    })
    return jsonify({"success": True})
