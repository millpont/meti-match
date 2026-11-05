"""Contracts — created automatically when a response is accepted (see responses_routes.py's
update_status). See plans/meti-match/03-api-plan.md."""
import logging
from datetime import date, datetime, timedelta, timezone

from flask import Blueprint, request, jsonify, session

import sb
import stats
from auth import requires_auth, is_superadmin
from enrollments_routes import active_enrolled_grower_ids
from representations_routes import active_represented_buyer_ids, is_trader, require_trader
from notifications_routes import notify

# GAFTA/FOSFA-informed dispute categories. Quality/condition disputes go through expert
# determination (an independent superintendent's binding certificate) rather than full
# arbitration in real grain trading — everything else defaults to arbitration. Filing deadlines
# in real GAFTA/FOSFA contracts are contract-specific; 90 days from the delivery window's end is
# a reasonable stand-in for the commonly-cited window, not a legal determination.
DISPUTE_CATEGORIES = ("non_performance", "quality_condition", "force_majeure", "demurrage_laytime", "price_damages", "other")
EXPERT_DETERMINATION_CATEGORIES = {"quality_condition"}
FILING_WINDOW_DAYS = 90

logger = logging.getLogger(__name__)
contracts_bp = Blueprint("contracts", __name__)

TABLE = "contracts"
STATUS_ORDER = ("pending", "shipped", "completed")


def _now():
    return datetime.now(timezone.utc).isoformat()


def _require_account():
    acct = session.get("account_id")
    if not acct:
        return None, (jsonify({"error": "no account access"}), 403)
    return str(acct), None


def _num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _can_act_on_contract(acct, role, row):
    """Whether acct may raise a dispute or advance status on this contract — the two direct
    parties, plus (per the Trader role's "manage the execution of any agreement made by [a
    represented] international buyer" capability) a service provider actively representing the
    buyer side."""
    if acct in (str(row["seller_account_id"]), str(row["buyer_account_id"])):
        return True
    if role == "service_provider" and is_trader(acct) and str(row["buyer_account_id"]) in active_represented_buyer_ids(acct):
        return True
    return False


def _contract_json(row):
    d = dict(row)
    d["id"] = str(d["id"])
    d["response_id"] = str(d["response_id"])
    d["seller_account_id"] = str(d["seller_account_id"])
    d["buyer_account_id"] = str(d["buyer_account_id"])
    d["final_volume"] = _num(d.get("final_volume"))
    d["final_price_usd_per_mt"] = _num(d.get("final_price_usd_per_mt"))
    return d


@contracts_bp.route("/api/contracts", methods=["GET"])
@requires_auth
def list_contracts():
    acct, err = _require_account()
    if err:
        return err
    role = session.get("role")
    if is_superadmin():
        rows = sb.select(TABLE, {"order": "created_at.desc", "select": "*"})
    elif role == "international_buyer":
        rows = sb.select(TABLE, {"buyer_account_id": f"eq.{acct}", "order": "created_at.desc", "select": "*"})
    elif role == "service_provider":
        not_trader = require_trader(acct, role)
        if not_trader:
            return not_trader
        represented = active_represented_buyer_ids(acct)
        rows = sb.select(TABLE, {
            "buyer_account_id": f"in.({','.join(represented)})", "order": "created_at.desc", "select": "*",
        }) if represented else []
    else:
        rows = sb.select(TABLE, {"seller_account_id": f"eq.{acct}", "order": "created_at.desc", "select": "*"})

    ids = {str(r["seller_account_id"]) for r in rows} | {str(r["buyer_account_id"]) for r in rows}
    names = {}
    if ids:
        for a in sb.select("accounts", {"id": f"in.({','.join(ids)})", "select": "id,name"}):
            names[str(a["id"])] = a.get("name")

    contract_ids = [str(r["id"]) for r in rows]
    open_dispute_ids = set()
    if contract_ids:
        disputed = sb.select("disputes", {
            "contract_id": f"in.({','.join(contract_ids)})", "status": "eq.open", "select": "contract_id",
        })
        open_dispute_ids = {str(d["contract_id"]) for d in disputed}

    out = []
    for r in rows:
        d = _contract_json(r)
        seller_id, buyer_id = d["seller_account_id"], d["buyer_account_id"]
        d["seller_name"] = names.get(seller_id)
        d["buyer_name"] = names.get(buyer_id)
        d["counterparty_name"] = names.get(buyer_id if acct == seller_id else seller_id)
        d["has_open_dispute"] = d["id"] in open_dispute_ids
        out.append(d)
    return jsonify({"success": True, "contracts": out})


@contracts_bp.route("/api/my-stats", methods=["GET"])
@requires_auth
def my_stats():
    """Same shape as admin_routes.py's marketplace-wide dashboard stats, but scoped to the
    caller's own contracts — every non-admin role wants to see a summary of their own activity,
    not everyone else's (that's what the admin dashboard is for).

    A program operator's "own activity" also includes their actively-enrolled growers' contracts
    (a reporting rollup — ownership/contracts stay with the grower, this just combines the
    totals for the operator's dashboard). A service provider's is their represented buyers'
    contracts (they have no contracts of their own). Buyers and growers see only their own."""
    acct, err = _require_account()
    if err:
        return err
    role = session.get("role")
    key = "buyer_account_id" if role in ("international_buyer", "service_provider") else "seller_account_id"
    if role == "service_provider":
        # A technical-services (non-Trader) provider has no agreement activity to summarize.
        buyer_ids = active_represented_buyer_ids(acct) if is_trader(acct) else set()
        id_filter = f"in.({','.join(buyer_ids)})" if buyer_ids else "eq.00000000-0000-0000-0000-000000000000"
    elif key == "buyer_account_id":
        id_filter = f"eq.{acct}"
    else:
        seller_ids = {acct}
        if role == "program_operator":
            seller_ids |= active_enrolled_grower_ids(acct)
        id_filter = f"in.({','.join(seller_ids)})"
    contracts = sb.select(TABLE, {key: id_filter, "select": "*"})
    current_window, prior_window = stats.windowed(contracts)

    counterparty_key = "seller_account_id" if key == "buyer_account_id" else "buyer_account_id"
    return jsonify({
        "success": True,
        "stats": {
            "total_volume_mt": stats.stat(stats.volume, current_window, prior_window),
            "gmv_usd": stats.stat(stats.gmv, current_window, prior_window),
            "total_transactions": stats.stat(len, current_window, prior_window),
            "active_counterparties": stats.stat(
                lambda cs: stats.distinct(cs, counterparty_key), current_window, prior_window,
            ),
        },
    })


@contracts_bp.route("/api/disputes", methods=["POST"])
@requires_auth
def raise_dispute():
    acct, err = _require_account()
    if err:
        return err
    data = request.get_json() or {}
    contract_id = data.get("contract_id")
    reason = (data.get("reason") or "").strip()
    category = data.get("category") or "other"
    if not contract_id or not reason:
        return jsonify({"error": "An agreement and reason are required"}), 400
    if category not in DISPUTE_CATEGORIES:
        return jsonify({"error": f"category must be one of {DISPUTE_CATEGORIES}"}), 400

    rows = sb.select(TABLE, {
        "id": f"eq.{contract_id}",
        "select": "seller_account_id,buyer_account_id,delivery_window_end,created_at,commodity,variety", "limit": 1,
    })
    if not rows:
        return jsonify({"error": "agreement not found"}), 404
    row = rows[0]
    seller_id, buyer_id = str(row["seller_account_id"]), str(row["buyer_account_id"])
    role = session.get("role")
    if not _can_act_on_contract(acct, role, row):
        return jsonify({"error": "not a party to this agreement"}), 403

    # Filing deadline anchors to the contract's delivery window end where known (matches how
    # real GAFTA/FOSFA time-bar clauses tie to delivery/completion), else the contract's own
    # creation date. This is advisory only — see is_time_barred below.
    anchor = row.get("delivery_window_end") or str(row["created_at"])[:10]
    anchor_date = date.fromisoformat(str(anchor)[:10])
    filing_deadline = anchor_date + timedelta(days=FILING_WINDOW_DAYS)
    is_time_barred = date.today() > filing_deadline

    created = sb.insert("disputes", {
        "contract_id": contract_id,
        "raised_by_account_id": acct,
        "reason": reason,
        "description": (data.get("description") or "").strip() or None,
        "category": category,
        "resolution_track": "expert_determination" if category in EXPERT_DETERMINATION_CATEGORIES else "arbitration",
        "filing_deadline": filing_deadline.isoformat(),
        "is_time_barred": is_time_barred,
        "status": "open",
    })
    label = f"{row['commodity']} — {row['variety']}" if row.get("variety") else row["commodity"]
    # A service provider raising this on a represented buyer's behalf counts as the buyer side
    # for notification purposes — the seller is always "the other side" from them.
    acting_as_buyer_side = acct == buyer_id or role == "service_provider"
    notify(
        seller_id if acting_as_buyer_side else buyer_id, "dispute_raised",
        title=f"A dispute was raised on your {label} agreement",
        body=reason, link_type="dispute", link_id=created["id"],
    )
    return jsonify({"success": True, "dispute_id": str(created["id"]), "is_time_barred": is_time_barred})


@contracts_bp.route("/api/contracts/<contract_id>/status", methods=["PATCH"])
@requires_auth
def update_contract_status(contract_id):
    acct, err = _require_account()
    if err:
        return err
    new_status = (request.get_json() or {}).get("status")
    if new_status not in STATUS_ORDER:
        return jsonify({"error": f"status must be one of {STATUS_ORDER}"}), 400

    rows = sb.select(TABLE, {"id": f"eq.{contract_id}", "select": "seller_account_id,buyer_account_id,status", "limit": 1})
    if not rows:
        return jsonify({"error": "agreement not found"}), 404
    row = rows[0]
    if not _can_act_on_contract(acct, session.get("role"), row):
        return jsonify({"error": "not a party to this agreement"}), 403

    if STATUS_ORDER.index(new_status) < STATUS_ORDER.index(row["status"]):
        return jsonify({"error": f"cannot move status backward from {row['status']} to {new_status}"}), 400

    sb.update(TABLE, {"id": f"eq.{contract_id}"}, {"status": new_status, "updated_at": _now()})
    return jsonify({"success": True, "status": new_status})
