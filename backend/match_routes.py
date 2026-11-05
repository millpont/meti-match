"""The Match marketplace API, backed by the Supabase REST API (see sb.py). Array/JSON mutations
are read-modify-write in Python since PostgREST has no array_append/jsonb_set — fine at this scale.

Cleanups vs METI's meti_match: year is a real array; express-interest rejects your own deal; a
real admin approval endpoint."""
import logging
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, session

import sb
from config import config
from db import account_id_for_auth0
from auth import requires_auth, is_superadmin

logger = logging.getLogger(__name__)
match_bp = Blueprint("match", __name__)

TABLE = config.MATCH_TABLE
MESSAGES_TABLE = "open_match_messages"

OUTCOME_FIELDS = [
    "ci_commodity_t", "reductions_t", "removals_t", "water_quantity",
    "water_quality_n", "water_quality_p", "water_quality_tss", "acres",
]
TAXONOMY_ARRAYS = ["carbon_pools", "emission_sources", "credit_character"]
TAXONOMY_SCALARS = ["additionality", "stratum"]

DEAL_COLUMNS = [
    "id", "created_by", "account_type", "country", "state", "region", "commodity",
    "year", *OUTCOME_FIELDS, "outcome_pricing", "practices", "additional_data",
    *TAXONOMY_ARRAYS, *TAXONOMY_SCALARS,
    "is_approved", "matches", "match_statuses", "created_at",
]

VALID_STATUSES = ["in-communication", "in-negotiation", "deal-made", "declined"]


def _now():
    return datetime.now(timezone.utc).isoformat()


def _require_account():
    acct = session.get("account_id") or account_id_for_auth0(session["profile"]["user_id"])
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


def _as_list(v):
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


# --------------------------------------------------------------------------- validation

def _validate_deal(data):
    for field in ("account_type", "country", "commodity", "year"):
        if not data.get(field):
            return f"Missing required field: {field}"
    if data["account_type"] not in ("buyer", "seller"):
        return "account_type must be 'buyer' or 'seller'"
    if not isinstance(data.get("state"), list) or not data["state"]:
        return "state must be a non-empty array"

    outcomes = {f: _num(data.get(f)) for f in OUTCOME_FIELDS}
    if not any(v is not None for v in outcomes.values()):
        return "At least one outcome quantity is required"

    if data["account_type"] == "buyer":
        pricing = data.get("outcome_pricing") or {}
        for f, val in outcomes.items():
            if val is None:
                continue
            p = pricing.get(f) or {}
            floor, ceiling = _num(p.get("floor")), _num(p.get("ceiling"))
            if floor is None or ceiling is None:
                return f"Buyers must set a price floor and ceiling for {f}"
            if floor > ceiling:
                return f"Price floor cannot exceed ceiling for {f}"
    return None


# --------------------------------------------------------------------------- matching engine

def _lists_overlap(a, b):
    if not a or not b:
        return True
    return bool(set(map(str, a)) & set(map(str, b)))


def _scalar_compatible(a, b):
    if not a or not b:
        return True
    return a == b


def _meets_numeric(new_type, requested, candidate_supply):
    if requested is None:
        return True
    if candidate_supply is None:
        return False
    return candidate_supply >= requested if new_type == "buyer" else candidate_supply <= requested


def _find_matches(new_deal, limit=5):
    counterpart = "seller" if new_deal["account_type"] == "buyer" else "buyer"
    board = "offer" if counterpart == "seller" else "bid"
    candidates = sb.select(TABLE, {
        "is_approved": "eq.true", "account_type": f"eq.{counterpart}",
        "order": "created_at.desc", "limit": "200", "select": "*",
    })

    out = []
    for c in candidates:
        if not _lists_overlap(new_deal.get("state"), c.get("state")):
            continue
        if not _lists_overlap(new_deal.get("commodity"), c.get("commodity")):
            continue
        if not _lists_overlap(new_deal.get("year"), c.get("year")):
            continue
        if not all(_lists_overlap(new_deal.get(f), c.get(f)) for f in TAXONOMY_ARRAYS):
            continue
        if not _scalar_compatible(new_deal.get("stratum"), c.get("stratum")):
            continue
        if not all(
            _meets_numeric(new_deal["account_type"], _num(new_deal.get(f)), _num(c.get(f)))
            for f in OUTCOME_FIELDS
        ):
            continue
        out.append({
            "id": str(c["id"]), "account_type": c["account_type"],
            "states": c.get("state") or [], "commodities": c.get("commodity") or [],
            "years": c.get("year") or [], "board": board,
            "carbon_pools": c.get("carbon_pools") or [],
            "emission_sources": c.get("emission_sources") or [],
            **{f: _num(c.get(f)) for f in OUTCOME_FIELDS},
        })
        if len(out) >= limit:
            break
    return out


# --------------------------------------------------------------------------- serialization

def _deal_json(row, viewer_account_id):
    d = {}
    for k in DEAL_COLUMNS:
        v = row.get(k)
        if k in ("id", "created_by"):
            d[k] = str(v) if v is not None else None
        elif k in OUTCOME_FIELDS:
            d[k] = _num(v)
        else:
            d[k] = v
    ca = row.get("created_at")
    d["created_at"] = ca if isinstance(ca, str) else (ca.isoformat() if ca else None)
    d["is_own"] = str(row.get("created_by")) == str(viewer_account_id)
    d["match_count"] = len(row.get("matches") or [])
    d["user_expressed_interest"] = str(viewer_account_id) in (row.get("matches") or [])
    return d


def _one(table, deal_id, select="*"):
    rows = sb.select(table, {"id": f"eq.{deal_id}", "select": select, "limit": 1})
    return rows[0] if rows else None


# --------------------------------------------------------------------------- routes

@match_bp.route("/api/deals", methods=["POST"])
@requires_auth
def create_deal():
    acct, err = _require_account()
    if err:
        return err
    data = request.get_json() or {}
    problem = _validate_deal(data)
    if problem:
        return jsonify({"error": problem}), 400

    # Auto-approve: listings go live on the boards immediately. Approval is now the *creator's*
    # job (they accept/decline each account that expresses interest, in Matches). An admin can
    # still remove a listing after the fact via the admin takedown route.
    is_approved = True
    row = {
        "created_by": acct, "account_type": data["account_type"], "country": data["country"],
        "state": _as_list(data.get("state")), "region": _as_list(data.get("region")),
        "commodity": _as_list(data.get("commodity")), "year": _as_list(data.get("year")),
        **{f: _num(data.get(f)) for f in OUTCOME_FIELDS},
        "outcome_pricing": data.get("outcome_pricing"),
        "practices": data.get("practices"),
        "additional_data": data.get("additional_data"),
        **{f: _as_list(data.get(f)) for f in TAXONOMY_ARRAYS},
        **{f: (data.get(f) or None) for f in TAXONOMY_SCALARS},
        "is_approved": is_approved,
    }
    try:
        created = sb.insert(TABLE, row)
    except sb.SupabaseError as e:
        # Tolerate a DB where the 0002 taxonomy columns haven't been added yet.
        if any(col in str(e) for col in TAXONOMY_ARRAYS + TAXONOMY_SCALARS):
            for col in TAXONOMY_ARRAYS + TAXONOMY_SCALARS:
                row.pop(col, None)
            created = sb.insert(TABLE, row)
        else:
            raise
    return jsonify({
        "success": True, "deal_id": str(created["id"]), "is_approved": is_approved,
        "matches": _find_matches(data),
    })


@match_bp.route("/api/deals/preview", methods=["POST"])
@requires_auth
def preview_matches():
    acct, err = _require_account()
    if err:
        return err
    data = request.get_json() or {}
    problem = _validate_deal(data)
    if problem:
        return jsonify({"error": problem}), 400
    return jsonify({"success": True, "matches": _find_matches(data)})


@match_bp.route("/api/deals", methods=["GET"])
@requires_auth
def approved_deals():
    acct, err = _require_account()
    if err:
        return err
    deal_type = request.args.get("type")
    states = [s.strip().upper() for s in request.args.get("states", "").split(",") if s.strip()]
    commodities = [c.strip().lower() for c in request.args.get("commodities", "").split(",") if c.strip()]
    years = [y.strip() for y in request.args.get("years", "").split(",") if y.strip()]

    params = {"is_approved": "eq.true", "order": "created_at.desc", "select": "*"}
    if deal_type in ("buyer", "seller"):
        params["account_type"] = f"eq.{deal_type}"
    rows = sb.select(TABLE, params)

    deals = []
    for r in rows:
        if states and not (set(map(str.upper, r.get("state") or [])) & set(states)):
            continue
        if commodities and not (set(c.lower() for c in (r.get("commodity") or [])) & set(commodities)):
            continue
        if years and not (set(map(str, r.get("year") or [])) & set(years)):
            continue
        deals.append(_deal_json(r, acct))
    return jsonify({"success": True, "deals": deals, "current_user_account_id": acct})


@match_bp.route("/api/deals/<deal_id>/interest", methods=["POST"])
@requires_auth
def express_interest(deal_id):
    acct, err = _require_account()
    if err:
        return err
    row = _one(TABLE, deal_id, "created_by,matches,match_statuses")
    if not row:
        return jsonify({"error": "deal not found"}), 404
    if str(row["created_by"]) == acct:
        return jsonify({"error": "cannot express interest in your own deal"}), 400
    matches = row.get("matches") or []
    if acct in matches:
        return jsonify({"error": "already expressed interest"}), 400
    matches = matches + [acct]
    # Interest lands as a PENDING request. The deal creator approves (accept -> in-communication)
    # or declines it from the Matches tab.
    statuses = dict(row.get("match_statuses") or {})
    statuses[acct] = "pending"
    sb.update(TABLE, {"id": f"eq.{deal_id}"}, {
        "matches": matches,
        "match_statuses": statuses,
        "updated_at": _now(),
    })
    return jsonify({"success": True, "matches": matches})


@match_bp.route("/api/matches", methods=["GET"])
@requires_auth
def user_matches():
    acct, err = _require_account()
    if err:
        return err
    rows = sb.select(TABLE, {
        "or": f"(created_by.eq.{acct},matches.cs.{{{acct}}})",
        "is_approved": "eq.true", "order": "created_at.desc", "select": "*",
    })

    all_ids = set()
    for r in rows:
        all_ids.update(r.get("matches") or [])
        all_ids.add(str(r["created_by"]))
    names = {}
    if all_ids:
        rows_a = sb.select("accounts", {"id": f"in.({','.join(all_ids)})", "select": "id,name"})
        names = {str(x["id"]): x["name"] for x in rows_a}

    out = []
    for r in rows:
        statuses = r.get("match_statuses") or {}
        is_creator = str(r["created_by"]) == acct
        deal = _deal_json(r, acct)
        if is_creator:
            # Show every interested party, including resolved ones — a match/rejection is logged,
            # not hidden.
            parties = {
                mid: {"name": names.get(mid, mid), "status": statuses.get(mid)}
                for mid in (r.get("matches") or [])
                if mid != acct
            }
            if not parties:
                continue
        else:
            my_status = statuses.get(acct)
            parties = {str(r["created_by"]): {
                "name": names.get(str(r["created_by"]), str(r["created_by"])),
                "status": my_status,
            }}
        deal["is_creator"] = is_creator
        deal["parties"] = parties
        out.append(deal)
    return jsonify({"success": True, "matches": out})


@match_bp.route("/api/matches/<deal_id>/status", methods=["POST"])
@requires_auth
def update_status(deal_id):
    acct, err = _require_account()
    if err:
        return err
    data = request.get_json() or {}
    new_status = data.get("status")
    party = data.get("match_account_id")
    if new_status not in VALID_STATUSES:
        return jsonify({"error": f"status must be one of {VALID_STATUSES}"}), 400

    row = _one(TABLE, deal_id, "created_by,matches,match_statuses")
    if not row:
        return jsonify({"error": "deal not found"}), 404
    if str(row["created_by"]) != acct:
        return jsonify({"error": "only the deal creator can update status"}), 403
    if party not in (row.get("matches") or []):
        return jsonify({"error": "that account has not expressed interest"}), 400

    statuses = dict(row.get("match_statuses") or {})
    statuses[party] = new_status
    sb.update(TABLE, {"id": f"eq.{deal_id}"}, {"match_statuses": statuses, "updated_at": _now()})
    return jsonify({"success": True, "match_statuses": statuses})


# ------- per-negotiation chat (available only while a party is 'in-negotiation') -------

def _negotiation_thread(deal_id, party_param, acct):
    """Authorize a chat thread and return (row, party, None) or (None, None, error_response).

    A thread is keyed by (deal_id, party) where `party` is the interested party. The two
    participants are the deal creator and that party — either may open the thread, and it is
    available as soon as interest is expressed (a match exists). It stays open through a
    consummated match; it closes only once the match has been rejected.
    """
    row = _one(TABLE, deal_id, "created_by,matches,match_statuses")
    if not row:
        return None, None, (jsonify({"error": "deal not found"}), 404)
    creator = str(row["created_by"])
    if acct == creator:
        party = str(party_param) if party_param else None
        if not party:
            return None, None, (jsonify({"error": "party is required"}), 400)
    else:
        party = acct  # an interested party can only reach their own thread
    if party not in (row.get("matches") or []):
        return None, None, (jsonify({"error": "no such interested party on this deal"}), 404)
    status = (row.get("match_statuses") or {}).get(party)
    if status == "declined":
        return None, None, (jsonify({"error": "chat is closed for a rejected match"}), 403)
    return row, party, None


@match_bp.route("/api/matches/<deal_id>/messages", methods=["GET"])
@requires_auth
def list_messages(deal_id):
    acct, err = _require_account()
    if err:
        return err
    _row, party, err = _negotiation_thread(deal_id, request.args.get("party"), acct)
    if err:
        return err
    msgs = sb.select(MESSAGES_TABLE, {
        "deal_id": f"eq.{deal_id}",
        "party_account_id": f"eq.{party}",
        "order": "created_at.asc",
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
    return jsonify({"success": True, "messages": out, "party_account_id": party})


@match_bp.route("/api/matches/<deal_id>/messages", methods=["POST"])
@requires_auth
def post_message(deal_id):
    acct, err = _require_account()
    if err:
        return err
    data = request.get_json() or {}
    body = (data.get("body") or "").strip()
    if not body:
        return jsonify({"error": "message body is required"}), 400
    if len(body) > 4000:
        return jsonify({"error": "message is too long (4000 char max)"}), 400
    _row, party, err = _negotiation_thread(deal_id, data.get("party"), acct)
    if err:
        return err
    sb.insert(MESSAGES_TABLE, {
        "deal_id": deal_id,
        "party_account_id": party,
        "sender_account_id": acct,
        "body": body,
    }, return_representation=False)
    return jsonify({"success": True})


# ------- admin approval (NEW: METI had no route for this; it was a manual DB edit) -------

@match_bp.route("/api/admin/deals/pending", methods=["GET"])
@requires_auth
def pending_deals():
    if not is_superadmin():
        return jsonify({"error": "admin only"}), 403
    rows = sb.select(TABLE, {"is_approved": "eq.false", "order": "created_at.desc", "select": "*"})
    return jsonify({"success": True, "deals": [_deal_json(r, None) for r in rows]})


@match_bp.route("/api/admin/deals/<deal_id>/approve", methods=["POST"])
@requires_auth
def approve_deal(deal_id):
    if not is_superadmin():
        return jsonify({"error": "admin only"}), 403
    approve = (request.get_json() or {}).get("approve", True)
    if approve:
        affected = sb.update(TABLE, {"id": f"eq.{deal_id}", "is_approved": "eq.false"},
                             {"is_approved": True, "updated_at": _now()}, return_representation=True)
    else:
        affected = sb.delete(TABLE, {"id": f"eq.{deal_id}", "is_approved": "eq.false"},
                             return_representation=True)
    if not affected:
        return jsonify({"error": "deal not found or already approved"}), 404
    return jsonify({"success": True, "approved": bool(approve)})


# ------- admin oversight: list every listing and remove (takedown) any one -------

@match_bp.route("/api/admin/deals/all", methods=["GET"])
@requires_auth
def all_deals_admin():
    if not is_superadmin():
        return jsonify({"error": "admin only"}), 403
    rows = sb.select(TABLE, {"order": "created_at.desc", "select": "*"})
    return jsonify({"success": True, "deals": [_deal_json(r, None) for r in rows]})


@match_bp.route("/api/admin/deals/<deal_id>", methods=["DELETE"])
@requires_auth
def remove_deal(deal_id):
    if not is_superadmin():
        return jsonify({"error": "admin only"}), 403
    affected = sb.delete(TABLE, {"id": f"eq.{deal_id}"}, return_representation=True)
    if not affected:
        return jsonify({"error": "deal not found"}), 404
    return jsonify({"success": True, "removed": True})
