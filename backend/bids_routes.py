"""Demand-side listings — international buyers, and (on their behalf, with approval) the
Service Providers (Traders) representing them. See plans/meti-match/03-api-plan.md.

The buyer-facing UI lands in Phase 3, but create/list exist starting Phase 2 so growers'
"Browse Bids" screen has real data to work against (see seeds/grain_demo.sql)."""
import logging
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, session

import sb
from auth import requires_auth
from responses_routes import (
    has_active_negotiation, remaining_amount_for_listing,
    active_negotiation_listing_ids, accepted_proposed_volumes_by_listing,
)
from representations_routes import active_represented_buyer_ids, require_trader
from notifications_routes import notify
from validation import date_range_error, merged_date_range_error
from production_data_routes import VISIBLE_COMMODITIES, VISIBLE_COMMODITY_FILTER
from business_verification import require_verified

logger = logging.getLogger(__name__)
bids_bp = Blueprint("bids", __name__)

TABLE = "bids"
VALID_BID_TYPE = ("available_grain", "acres_for_contracting", "volumes_for_contracting")
VALID_AREA_UNIT = ("acres", "hectares")


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


def _as_list(v):
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def _bid_json(row):
    d = dict(row)
    d["id"] = str(d["id"])
    d["created_by"] = str(d["created_by"])
    d["on_behalf_of_buyer_account_id"] = (
        str(d["on_behalf_of_buyer_account_id"]) if d.get("on_behalf_of_buyer_account_id") else None
    )
    d["quantity"] = _num(d.get("quantity"))
    d["bid_price_usd_per_mt"] = _num(d.get("bid_price_usd_per_mt"))
    d["has_active_negotiation"] = has_active_negotiation("bid", d["id"])
    # How much of this bid hasn't already gone into an accepted response's contract — several
    # growers (or one grower, several times) can each fulfill part of one RFQ over time (see
    # responses_routes.py's committed_amount_for_listing).
    d["remaining_quantity"] = remaining_amount_for_listing("bid", d["id"], d["quantity"])
    return d


def _bid_json_batch(rows):
    """Same shape as _bid_json for a whole page of rows at once, batching the two per-row
    lookups (active-negotiation, accepted-response amounts) into one query each instead of one
    query per row — see offers_routes.py's _offer_json_batch, same reasoning."""
    if not rows:
        return []
    ids = [str(r["id"]) for r in rows]
    negotiating_ids = active_negotiation_listing_ids("bid", ids)
    accepted_by_listing = accepted_proposed_volumes_by_listing("bid", ids)

    out = []
    for row in rows:
        d = dict(row)
        d["id"] = str(d["id"])
        d["created_by"] = str(d["created_by"])
        d["on_behalf_of_buyer_account_id"] = (
            str(d["on_behalf_of_buyer_account_id"]) if d.get("on_behalf_of_buyer_account_id") else None
        )
        d["quantity"] = _num(d.get("quantity"))
        d["bid_price_usd_per_mt"] = _num(d.get("bid_price_usd_per_mt"))
        d["has_active_negotiation"] = d["id"] in negotiating_ids
        total = d["quantity"]
        if total is None:
            d["remaining_quantity"] = None
        else:
            committed = sum((v if v is not None else total) for v in accepted_by_listing.get(d["id"], []))
            d["remaining_quantity"] = total - committed
        out.append(d)
    return out


@bids_bp.route("/api/bids", methods=["POST"])
@requires_auth
def create_bid():
    acct, err = _require_account()
    if err:
        return err
    role = session.get("role")
    if role not in ("international_buyer", "service_provider"):
        return jsonify({"error": "only international buyers (or a service provider on their behalf) can create bids"}), 403
    not_trader = require_trader(acct, role)
    if not_trader:
        return not_trader

    data = request.get_json() or {}
    # Saving a draft is always allowed — only going live needs business verification. A
    # service provider's on-behalf bid has no draft step (it goes to the buyer for approval).
    status = data.get("status") or "open"
    if status not in ("draft", "open"):
        return jsonify({"error": "status must be draft or open"}), 400
    if status == "draft" and data.get("on_behalf_of_buyer_account_id"):
        return jsonify({"error": "a bid placed on a buyer's behalf can't be saved as a draft"}), 400
    if status == "open":
        unverified = require_verified(acct, role, "publish a listing")
        if unverified:
            return unverified

    for field in ("commodity", "bid_type", "quantity"):
        if not data.get(field):
            return jsonify({"error": f"Missing required field: {field}"}), 400
    if data["commodity"] not in VISIBLE_COMMODITIES:
        return jsonify({"error": f"commodity must be one of {VISIBLE_COMMODITIES}"}), 400
    if data["bid_type"] not in VALID_BID_TYPE:
        return jsonify({"error": f"bid_type must be one of {VALID_BID_TYPE}"}), 400
    area_unit = data.get("area_unit") or None
    if area_unit and area_unit not in VALID_AREA_UNIT:
        return jsonify({"error": f"area_unit must be one of {VALID_AREA_UNIT}"}), 400
    range_err = date_range_error(data.get("delivery_window_start"), data.get("delivery_window_end"), "Delivery Window")
    if range_err:
        return jsonify({"error": range_err}), 400

    # A Trader has no buyer profile of their own to bid as — every bid they create has to be on
    # a specific represented buyer's behalf, gated by that buyer's approval. A buyer creating
    # their own bid never goes through this.
    on_behalf_of = data.get("on_behalf_of_buyer_account_id") or None
    if role == "service_provider":
        if not on_behalf_of:
            return jsonify({"error": "on_behalf_of_buyer_account_id is required for a service provider"}), 400
        if on_behalf_of not in active_represented_buyer_ids(acct):
            return jsonify({"error": "you don't actively represent this buyer"}), 400
    else:
        on_behalf_of = None

    attribute_notes = data.get("required_attribute_notes")
    row = {
        "created_by": acct,
        "commodity": data["commodity"],
        "variety": data.get("variety") or None,
        "bid_type": data["bid_type"],
        "quantity": _num(data.get("quantity")),
        # Display-only — quantity itself is always normalized to acres before it gets here (same
        # convention as offers.acres_offered/area_unit), only meaningful for acres_for_contracting.
        "area_unit": area_unit if data["bid_type"] == "acres_for_contracting" else None,
        "bid_price_usd_per_mt": _num(data.get("bid_price_usd_per_mt")),
        "delivery_window_start": data.get("delivery_window_start") or None,
        "delivery_window_end": data.get("delivery_window_end") or None,
        "required_attributes": _as_list(data.get("required_attributes")),
        "required_practices": _as_list(data.get("required_practices")),
        "required_certifications": _as_list(data.get("required_certifications")),
        "required_data_requirements": _as_list(data.get("required_data_requirements")),
        "required_attribute_notes": attribute_notes if isinstance(attribute_notes, dict) else {},
        "allow_partial": data.get("allow_partial", True) if isinstance(data.get("allow_partial", True), bool) else True,
        "destination_country": data.get("destination_country") or None,
        "status": status,
        "on_behalf_of_buyer_account_id": on_behalf_of,
        "buyer_approval_status": "pending" if on_behalf_of else "not_required",
    }
    created = sb.insert(TABLE, row)
    if on_behalf_of:
        label = f"{row['commodity']} — {row['variety']}" if row.get("variety") else row["commodity"]
        notify(
            on_behalf_of, "bid_approval_requested",
            title=f"A service provider wants to place a {label} bid on your behalf",
            body=f"{row['quantity']:g} {'acres' if row['bid_type'] == 'acres_for_contracting' else 'MT'} — review and approve or decline.",
            link_type="bid", link_id=created["id"],
        )
    return jsonify({"success": True, "bid": _bid_json(created)})


@bids_bp.route("/api/bids", methods=["GET"])
@requires_auth
def browse_bids():
    _acct, err = _require_account()
    if err:
        return err
    commodities = [c.strip() for c in request.args.get("commodities", "").split(",") if c.strip()]
    bid_types = [b.strip() for b in request.args.get("bid_types", "").split(",") if b.strip()]
    attributes = [a.strip() for a in request.args.get("attributes", "").split(",") if a.strip()]
    destination_countries = [c.strip() for c in request.args.get("destination_countries", "").split(",") if c.strip()]
    qty_min = _num(request.args.get("quantity_min"))
    qty_max = _num(request.args.get("quantity_max"))
    organizations = [o.strip() for o in request.args.get("organizations", "").split(",") if o.strip()]

    # buyer_approval_status=neq.pending excludes an on-behalf-of bid still awaiting the buyer's
    # approval — status alone can't do this. (Drafts are excluded by status=open.)
    rows = sb.select(TABLE, {
        "status": "eq.open", "buyer_approval_status": "neq.pending", "commodity": VISIBLE_COMMODITY_FILTER,
        "order": "created_at.desc", "select": "*",
    })
    matched_rows = []
    for r in rows:
        # Matches the BUYER on a trader's on-behalf-of bid, not the trader — same convention as
        # browse_offers' organization filter.
        if organizations and str(r.get("on_behalf_of_buyer_account_id") or r.get("created_by") or "") not in organizations:
            continue
        if commodities and r.get("commodity") not in commodities:
            continue
        if bid_types and r.get("bid_type") not in bid_types:
            continue
        if attributes and not (set(r.get("required_attributes") or []) & set(attributes)):
            continue
        if destination_countries and r.get("destination_country") not in destination_countries:
            continue
        qty = _num(r.get("quantity"))
        if qty_min is not None and (qty is None or qty < qty_min):
            continue
        if qty_max is not None and (qty is None or qty > qty_max):
            continue
        matched_rows.append(r)

    # Batched, not one-query-per-row — see _bid_json_batch.
    out = _bid_json_batch(matched_rows)

    # The creator's own display name — for ProfileLink on the browse card ("View Profile" should
    # show whose profile it is, not just a generic label). Batch-fetched, not per-row, same
    # convention as contracts_routes.py's seller_name/buyer_name.
    creator_ids = {d["created_by"] for d in out}
    if creator_ids:
        names = {str(a["id"]): a.get("name") for a in sb.select("accounts", {"id": f"in.({','.join(creator_ids)})", "select": "id,name"})}
        for d in out:
            d["created_by_name"] = names.get(d["created_by"])

    return jsonify({"success": True, "bids": out})


@bids_bp.route("/api/bids/mine", methods=["GET"])
@requires_auth
def my_bids():
    acct, err = _require_account()
    if err:
        return err
    rows = sb.select(TABLE, {"created_by": f"eq.{acct}", "order": "created_at.desc", "select": "*"})

    buyer_ids = {str(r["on_behalf_of_buyer_account_id"]) for r in rows if r.get("on_behalf_of_buyer_account_id")}
    names = {}
    if buyer_ids:
        for a in sb.select("accounts", {"id": f"in.({','.join(buyer_ids)})", "select": "id,name"}):
            names[str(a["id"])] = a.get("name")

    out = []
    for r in rows:
        d = _bid_json(r)
        bid_buyer_id = d.get("on_behalf_of_buyer_account_id")
        d["on_behalf_of_buyer_name"] = names.get(str(bid_buyer_id)) if bid_buyer_id else None
        out.append(d)
    return jsonify({"success": True, "bids": out})


@bids_bp.route("/api/bids/pending-approval", methods=["GET"])
@requires_auth
def bids_pending_approval():
    """Bids a service provider wants to place on this buyer's behalf, awaiting their approval."""
    acct, err = _require_account()
    if err:
        return err
    if session.get("role") != "international_buyer":
        return jsonify({"error": "only international buyers have bids awaiting approval"}), 403
    rows = sb.select(TABLE, {
        "on_behalf_of_buyer_account_id": f"eq.{acct}", "buyer_approval_status": "eq.pending",
        "order": "created_at.desc", "select": "*",
    })
    sp_ids = {str(r["created_by"]) for r in rows}
    names = {}
    if sp_ids:
        for a in sb.select("accounts", {"id": f"in.({','.join(sp_ids)})", "select": "id,name"}):
            names[str(a["id"])] = a.get("name")
    out = []
    for r in rows:
        d = _bid_json(r)
        d["service_provider_name"] = names.get(d["created_by"])
        out.append(d)
    return jsonify({"success": True, "bids": out})


def _owned_pending_approval(bid_id, acct):
    rows = sb.select(TABLE, {
        "id": f"eq.{bid_id}",
        "select": "on_behalf_of_buyer_account_id,buyer_approval_status,created_by,commodity,variety", "limit": 1,
    })
    if not rows:
        return None, (jsonify({"error": "bid not found"}), 404)
    row = rows[0]
    if str(row.get("on_behalf_of_buyer_account_id") or "") != acct:
        return None, (jsonify({"error": "only the buyer this bid is on behalf of can act on it"}), 403)
    if row["buyer_approval_status"] != "pending":
        return None, (jsonify({"error": "this bid is not awaiting your approval"}), 400)
    return row, None


@bids_bp.route("/api/bids/<bid_id>/approve", methods=["POST"])
@requires_auth
def approve_bid(bid_id):
    acct, err = _require_account()
    if err:
        return err
    row, owned_err = _owned_pending_approval(bid_id, acct)
    if owned_err:
        return owned_err
    updated = sb.update(TABLE, {"id": f"eq.{bid_id}"}, {
        "buyer_approval_status": "approved", "updated_at": _now(),
    }, return_representation=True)
    label = f"{row['commodity']} — {row['variety']}" if row.get("variety") else row["commodity"]
    notify(
        row["created_by"], "bid_approved",
        title=f"Your on-behalf-of bid for {label} was approved",
        link_type="bid", link_id=bid_id,
    )
    return jsonify({"success": True, "bid": _bid_json(updated[0])})


@bids_bp.route("/api/bids/<bid_id>/decline", methods=["POST"])
@requires_auth
def decline_bid(bid_id):
    acct, err = _require_account()
    if err:
        return err
    row, owned_err = _owned_pending_approval(bid_id, acct)
    if owned_err:
        return owned_err
    sb.update(TABLE, {"id": f"eq.{bid_id}"}, {
        "buyer_approval_status": "declined", "status": "closed", "updated_at": _now(),
    })
    label = f"{row['commodity']} — {row['variety']}" if row.get("variety") else row["commodity"]
    notify(
        row["created_by"], "bid_declined",
        title=f"Your on-behalf-of bid for {label} was declined",
        link_type="bid", link_id=bid_id,
    )
    return jsonify({"success": True})


# Fields safe to edit in place — commodity/bid_type/quantity are never editable here at all
# (withdraw-and-recreate is the path for those, same boundary as offers_routes.py's PATCH).
EDITABLE_BID_FIELDS = (
    "variety", "bid_price_usd_per_mt", "delivery_window_start", "delivery_window_end",
    "required_attributes", "required_practices", "required_certifications",
    "required_data_requirements", "required_attribute_notes", "destination_country", "allow_partial",
)
IMMUTABLE_BID_FIELDS = ("commodity", "bid_type", "quantity", "area_unit")


@bids_bp.route("/api/bids/<bid_id>", methods=["PATCH"])
@requires_auth
def update_bid(bid_id):
    acct, err = _require_account()
    if err:
        return err
    rows = sb.select(TABLE, {
        "id": f"eq.{bid_id}", "select": "created_by,delivery_window_start,delivery_window_end", "limit": 1,
    })
    if not rows:
        return jsonify({"error": "bid not found"}), 404
    if str(rows[0]["created_by"]) != acct:
        return jsonify({"error": "only the creator can edit this listing"}), 403

    data = request.get_json() or {}
    range_err = merged_date_range_error(rows[0], data, "delivery_window_start", "delivery_window_end", "Delivery Window")
    if range_err:
        return jsonify({"error": range_err}), 400
    attempted_immutable = [f for f in IMMUTABLE_BID_FIELDS if f in data]
    if attempted_immutable:
        return jsonify({
            "error": f"{', '.join(attempted_immutable)} can't be edited after a listing is created "
                     f"— close it and create a new one instead.",
        }), 400

    patch = {}
    for f in EDITABLE_BID_FIELDS:
        if f not in data:
            continue
        if f == "bid_price_usd_per_mt":
            patch[f] = _num(data[f])
        elif f in ("required_attributes", "required_practices", "required_certifications", "required_data_requirements"):
            patch[f] = _as_list(data[f])
        elif f == "required_attribute_notes":
            patch[f] = data[f] if isinstance(data[f], dict) else {}
        elif f == "allow_partial":
            patch[f] = bool(data[f])
        else:
            patch[f] = data[f] or None
    if not patch:
        return jsonify({"error": "nothing to update"}), 400
    patch["updated_at"] = _now()
    updated = sb.update(TABLE, {"id": f"eq.{bid_id}"}, patch, return_representation=True)
    return jsonify({"success": True, "bid": _bid_json(updated[0])})


@bids_bp.route("/api/bids/<bid_id>/publish", methods=["POST"])
@requires_auth
def publish_bid(bid_id):
    """Take one of the creator's own draft RFQs live — where business verification is enforced
    (business_verification.py), mirroring offers_routes.py's publish_offer."""
    acct, err = _require_account()
    if err:
        return err
    rows = sb.select(TABLE, {"id": f"eq.{bid_id}", "select": "created_by,status,commodity", "limit": 1})
    if not rows:
        return jsonify({"error": "bid not found"}), 404
    row = rows[0]
    if str(row["created_by"]) != acct:
        return jsonify({"error": "only the creator can publish this listing"}), 403
    if row["status"] != "draft":
        return jsonify({"error": "only a draft can be published"}), 400
    if row["commodity"] not in VISIBLE_COMMODITIES:
        return jsonify({"error": f"commodity must be one of {VISIBLE_COMMODITIES}"}), 400
    unverified = require_verified(acct, session.get("role"), "publish a listing")
    if unverified:
        return unverified
    updated = sb.update(TABLE, {"id": f"eq.{bid_id}"}, {"status": "open", "updated_at": _now()}, return_representation=True)
    return jsonify({"success": True, "bid": _bid_json(updated[0])})


@bids_bp.route("/api/bids/<bid_id>/close", methods=["POST"])
@requires_auth
def close_bid(bid_id):
    acct, err = _require_account()
    if err:
        return err
    rows = sb.select(TABLE, {"id": f"eq.{bid_id}", "select": "created_by", "limit": 1})
    if not rows:
        return jsonify({"error": "bid not found"}), 404
    if str(rows[0]["created_by"]) != acct:
        return jsonify({"error": "only the creator can close this bid"}), 403
    sb.update(TABLE, {"id": f"eq.{bid_id}"}, {"status": "closed", "updated_at": _now()})
    return jsonify({"success": True})


@bids_bp.route("/api/bids/<bid_id>/touch", methods=["POST"])
@requires_auth
def touch_bid(bid_id):
    """Bumps updated_at to confirm a bid is still valid — the action behind the "still
    interested?" nudge for bids that haven't been touched in a while (see MyBidsTable)."""
    acct, err = _require_account()
    if err:
        return err
    rows = sb.select(TABLE, {"id": f"eq.{bid_id}", "select": "created_by", "limit": 1})
    if not rows:
        return jsonify({"error": "bid not found"}), 404
    if str(rows[0]["created_by"]) != acct:
        return jsonify({"error": "only the creator can refresh this bid"}), 403
    sb.update(TABLE, {"id": f"eq.{bid_id}"}, {"updated_at": _now()})
    return jsonify({"success": True})
