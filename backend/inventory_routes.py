"""Grower Inventory — a farm-level cap per commodity per marketing year, drawn down by BOTH the
holder's own published Offers AND their accepted/in-flight responses to a buyer's bid (the
client explicitly asked for a shared pool, not just Offers). Two independent pools per
commodity/marketing_year, mirroring offers' own quantity_basis split (see
migrations/0033_acres_inventory.sql): a grain-volume pool (bushels/MT) and an acres pool, each
with their own total/remaining. Mirrors enrollments_routes.py's committed_acres/
remaining_enrolled_acres shape throughout: nothing is decremented or stored — every "committed"
figure is live-summed fresh every call, so a withdrawn offer or declined response frees its share
back up automatically.

A program_operator can hold inventory under their own account too (they can already create
offers directly for their own grain, per program_operator_profiles.offers_own_grain) — this
module's endpoints aren't grower-exclusive despite the table/module name (kept for continuity
with the migration history)."""
import logging
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, session

import sb
import units
from auth import requires_auth

logger = logging.getLogger(__name__)
inventory_bp = Blueprint("inventory", __name__)

TABLE = "grower_inventory"
VALID_UOM = ("bushels", "MT")
VALID_AREA_UNIT = ("acres", "hectares")
VALID_QUANTITY_BASIS = ("grain", "acres")


def _now():
    return datetime.now(timezone.utc).isoformat()


def _require_inventory_owner():
    acct = session.get("account_id")
    if not acct:
        return None, (jsonify({"error": "no account access"}), 403)
    if session.get("role") not in ("grower", "program_operator"):
        return None, (jsonify({"error": "only growers and program operators have grain inventory"}), 403)
    return str(acct), None


def _num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _row_json(row):
    d = dict(row)
    d["id"] = str(d["id"])
    d["account_id"] = str(d["account_id"])
    d["total_volume"] = _num(d.get("total_volume"))
    d["total_acres"] = _num(d.get("total_acres"))
    return d


def committed_volume(grower_account_id, commodity, marketing_year, uom):
    """Live-summed, never stored: the grower's own non-withdrawn GRAIN-basis offers for this
    commodity/marketing_year, plus their own non-declined responses to a non-acres bid for the
    same commodity/marketing_year — both converted into `uom`."""
    total = 0.0

    offer_rows = sb.select("offers", {
        "created_by": f"eq.{grower_account_id}", "commodity": f"eq.{commodity}",
        "marketing_year": f"eq.{marketing_year}", "status": "neq.withdrawn",
        "quantity_basis": "eq.grain",
        "select": "expected_volume,uom",
    })
    for r in offer_rows:
        try:
            converted = units.convert_volume(_num(r.get("expected_volume")), r.get("uom"), uom, commodity)
        except ValueError:
            continue
        total += converted or 0.0

    response_rows = sb.select("listing_responses", {
        "responder_account_id": f"eq.{grower_account_id}", "listing_type": "eq.bid",
        "marketing_year": f"eq.{marketing_year}", "status": "neq.declined",
        "select": "proposed_volume,listing_id",
    })
    bid_ids = {str(r["listing_id"]) for r in response_rows if r.get("proposed_volume") is not None}
    bids_by_id = {}
    if bid_ids:
        for b in sb.select("bids", {"id": f"in.({','.join(bid_ids)})", "select": "id,commodity,bid_type"}):
            bids_by_id[str(b["id"])] = b
    for r in response_rows:
        vol = _num(r.get("proposed_volume"))
        bid = bids_by_id.get(str(r["listing_id"]))
        if vol is None or not bid or bid.get("commodity") != commodity or bid.get("bid_type") == "acres_for_contracting":
            continue
        # The amount-picker popup asks/shows the response amount in the SAME uom as the
        # grower's inventory record — no further conversion needed here.
        total += vol

    return total


def committed_acres(grower_account_id, commodity, marketing_year):
    """The acres-pool analog of committed_volume: the grower's own non-withdrawn ACRES-basis
    offers for this commodity/marketing_year, plus their own non-declined responses to an
    acres_for_contracting bid for the same commodity/marketing_year — a response's
    proposed_volume is the acres amount they proposed in that case, same field, different unit
    by convention (see responses_routes.py's amount-picker, which asks in acres for this bid_type)."""
    total = 0.0

    offer_rows = sb.select("offers", {
        "created_by": f"eq.{grower_account_id}", "commodity": f"eq.{commodity}",
        "marketing_year": f"eq.{marketing_year}", "status": "neq.withdrawn",
        "quantity_basis": "eq.acres",
        "select": "acres_offered",
    })
    for r in offer_rows:
        total += _num(r.get("acres_offered")) or 0.0

    response_rows = sb.select("listing_responses", {
        "responder_account_id": f"eq.{grower_account_id}", "listing_type": "eq.bid",
        "marketing_year": f"eq.{marketing_year}", "status": "neq.declined",
        "select": "proposed_volume,listing_id",
    })
    bid_ids = {str(r["listing_id"]) for r in response_rows if r.get("proposed_volume") is not None}
    bids_by_id = {}
    if bid_ids:
        for b in sb.select("bids", {"id": f"in.({','.join(bid_ids)})", "select": "id,commodity,bid_type"}):
            bids_by_id[str(b["id"])] = b
    for r in response_rows:
        vol = _num(r.get("proposed_volume"))
        bid = bids_by_id.get(str(r["listing_id"]))
        if vol is None or not bid or bid.get("commodity") != commodity or bid.get("bid_type") != "acres_for_contracting":
            continue
        total += vol

    return total


def remaining_volume(grower_account_id, commodity, marketing_year):
    """(inventory_row, remaining) for the GRAIN pool — remaining is None if no inventory row is
    on file for this commodity/marketing_year (nothing to cap against, matches
    enrollments_routes.py's remaining_enrolled_acres "soft cap" behavior for growers who haven't
    set up inventory yet)."""
    rows = sb.select(TABLE, {
        "account_id": f"eq.{grower_account_id}", "commodity": f"eq.{commodity}",
        "marketing_year": f"eq.{marketing_year}", "quantity_basis": "eq.grain", "select": "*", "limit": 1,
    })
    if not rows:
        return None, None
    inventory = rows[0]
    total = _num(inventory.get("total_volume")) or 0.0
    committed = committed_volume(grower_account_id, commodity, marketing_year, inventory["uom"])
    return inventory, total - committed


def remaining_acres(grower_account_id, commodity, marketing_year):
    """(inventory_row, remaining) for the ACRES pool — same soft-cap semantics as remaining_volume."""
    rows = sb.select(TABLE, {
        "account_id": f"eq.{grower_account_id}", "commodity": f"eq.{commodity}",
        "marketing_year": f"eq.{marketing_year}", "quantity_basis": "eq.acres", "select": "*", "limit": 1,
    })
    if not rows:
        return None, None
    inventory = rows[0]
    total = _num(inventory.get("total_acres")) or 0.0
    committed = committed_acres(grower_account_id, commodity, marketing_year)
    return inventory, total - committed


@inventory_bp.route("/api/grower-inventory", methods=["GET"])
@requires_auth
def list_inventory():
    acct, err = _require_inventory_owner()
    if err:
        return err
    rows = sb.select(TABLE, {"account_id": f"eq.{acct}", "order": "commodity.asc,marketing_year.desc", "select": "*"})
    out = []
    for r in rows:
        d = _row_json(r)
        if r["quantity_basis"] == "grain":
            _, remaining = remaining_volume(acct, r["commodity"], r["marketing_year"])
            d["remaining_volume"] = remaining
            d["remaining_acres"] = None
        else:
            _, remaining = remaining_acres(acct, r["commodity"], r["marketing_year"])
            d["remaining_volume"] = None
            d["remaining_acres"] = remaining
        out.append(d)
    return jsonify({"success": True, "inventory": out})


@inventory_bp.route("/api/grower-inventory/remaining", methods=["GET"])
@requires_auth
def get_remaining():
    """Convenience lookup used by OfferForm and the respond-with-amount popup to validate
    against remaining capacity before submitting. Defaults to the grain pool (quantity_basis=grain)
    for the existing grain-basis call sites; pass quantity_basis=acres for the acres pool.
    remaining_volume/remaining_acres: null if no inventory row is on file for this commodity/
    marketing_year (nothing to cap against)."""
    acct, err = _require_inventory_owner()
    if err:
        return err
    commodity = (request.args.get("commodity") or "").strip()
    marketing_year = (request.args.get("marketing_year") or "").strip()
    quantity_basis = request.args.get("quantity_basis") or "grain"
    if not commodity or not marketing_year:
        return jsonify({"error": "commodity and marketing_year are required"}), 400
    if quantity_basis not in VALID_QUANTITY_BASIS:
        return jsonify({"error": f"quantity_basis must be one of {VALID_QUANTITY_BASIS}"}), 400
    if quantity_basis == "grain":
        inventory, remaining = remaining_volume(acct, commodity, marketing_year)
        return jsonify({
            "success": True, "remaining_volume": remaining, "remaining_acres": None,
            "uom": inventory["uom"] if inventory else None, "area_unit": None,
        })
    inventory, remaining = remaining_acres(acct, commodity, marketing_year)
    return jsonify({
        "success": True, "remaining_volume": None, "remaining_acres": remaining,
        "uom": None, "area_unit": inventory["area_unit"] if inventory else None,
    })


@inventory_bp.route("/api/grower-inventory/<commodity>/<marketing_year>", methods=["PUT"])
@requires_auth
def put_inventory(commodity, marketing_year):
    acct, err = _require_inventory_owner()
    if err:
        return err
    data = request.get_json() or {}
    quantity_basis = data.get("quantity_basis") or "grain"
    if quantity_basis not in VALID_QUANTITY_BASIS:
        return jsonify({"error": f"quantity_basis must be one of {VALID_QUANTITY_BASIS}"}), 400

    row = {
        "account_id": acct, "commodity": commodity, "marketing_year": marketing_year,
        "quantity_basis": quantity_basis, "updated_at": _now(),
    }
    if quantity_basis == "grain":
        uom = data.get("uom")
        total_volume = _num(data.get("total_volume"))
        if uom not in VALID_UOM:
            return jsonify({"error": f"uom must be one of {VALID_UOM}"}), 400
        if total_volume is None or total_volume < 0:
            return jsonify({"error": "total_volume is required"}), 400
        row.update({"total_volume": total_volume, "uom": uom, "total_acres": None, "area_unit": None})
    else:
        area_unit = data.get("area_unit")
        total_acres = _num(data.get("total_acres"))
        if area_unit not in VALID_AREA_UNIT:
            return jsonify({"error": f"area_unit must be one of {VALID_AREA_UNIT}"}), 400
        if total_acres is None or total_acres < 0:
            return jsonify({"error": "total_acres is required"}), 400
        row.update({"total_acres": total_acres, "area_unit": area_unit, "total_volume": None, "uom": None})

    sb.upsert(TABLE, row, on_conflict="account_id,commodity,marketing_year,quantity_basis")
    rows = sb.select(TABLE, {
        "account_id": f"eq.{acct}", "commodity": f"eq.{commodity}", "marketing_year": f"eq.{marketing_year}",
        "quantity_basis": f"eq.{quantity_basis}", "select": "*", "limit": 1,
    })
    return jsonify({"success": True, "inventory": _row_json(rows[0])})


@inventory_bp.route("/api/grower-inventory/<commodity>/<marketing_year>", methods=["DELETE"])
@requires_auth
def delete_inventory(commodity, marketing_year):
    """Removing a pool entirely — nothing is decremented anywhere else (everything is live-
    summed, see module docstring), so the only thing to check is that nothing is currently
    committed against it; otherwise deleting would silently make an already-published offer or
    accepted response look uncapped."""
    acct, err = _require_inventory_owner()
    if err:
        return err
    quantity_basis = request.args.get("quantity_basis") or "grain"
    if quantity_basis not in VALID_QUANTITY_BASIS:
        return jsonify({"error": f"quantity_basis must be one of {VALID_QUANTITY_BASIS}"}), 400

    rows = sb.select(TABLE, {
        "account_id": f"eq.{acct}", "commodity": f"eq.{commodity}", "marketing_year": f"eq.{marketing_year}",
        "quantity_basis": f"eq.{quantity_basis}", "select": "*", "limit": 1,
    })
    if not rows:
        return jsonify({"error": "inventory row not found"}), 404

    if quantity_basis == "grain":
        committed = committed_volume(acct, commodity, marketing_year, rows[0]["uom"])
        unit = rows[0]["uom"]
    else:
        committed = committed_acres(acct, commodity, marketing_year)
        unit = rows[0]["area_unit"]
    if committed > 0:
        return jsonify({
            "error": f"You have {committed:g} {unit} committed to listings/responses for {commodity} "
                     f"{marketing_year} — withdraw those first before deleting this inventory.",
        }), 400

    sb.delete(TABLE, {"id": f"eq.{rows[0]['id']}"})
    return jsonify({"success": True})
