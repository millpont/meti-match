"""Supply-side listings — growers and program operators. See
plans/meti-match/03-api-plan.md."""
import logging
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, session

import sb
import storage
import units
import inventory_routes
from auth import requires_auth
from production_data_routes import resolve_production, MAX_UPLOAD_BYTES, NONE_OPTION, VISIBLE_COMMODITIES, VISIBLE_COMMODITY_FILTER
from responses_routes import (
    has_active_negotiation, remaining_amount_for_listing,
    active_negotiation_listing_ids, accepted_proposed_volumes_by_listing,
)
from enrollments_routes import remaining_enrolled_acres, active_enrollment_for
from validation import date_range_error, merged_date_range_error
from business_verification import require_verified
from notifications_routes import notify

logger = logging.getLogger(__name__)
offers_bp = Blueprint("offers", __name__)

TABLE = "offers"
VALID_UOM = ("bushels", "MT")
VALID_PRICE_TYPE = ("fixed", "basis")
VALID_STATUS = ("draft", "published", "accepted", "withdrawn")
VALID_IRRIGATION = ("dryland", "rainfed", "irrigated")
VALID_YIELD_UNIT = ("bu/acre", "MT/acre")
# Two independent segmentation axes (see migrations/0029_offer_segmentation.sql) — how the
# quantity is specified, and when it's ready. Orthogonal: all four combinations are valid.
VALID_QUANTITY_BASIS = ("grain", "acres")
VALID_LISTING_TIMING = ("available", "future")
# The Acres-basis quantity's yield rate unit — a separate, 3-option enum from
# override_yield_unit's 2-option production-data one (bu/acre, MT/acre, lbs/acre).
VALID_QUANTITY_YIELD_UNIT = ("bu/acre", "MT/hectare", "lbs/acre")
VALID_AREA_UNIT = ("acres", "hectares")
VALID_SEED_VARIETY = ("GM", "Non-GM")


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


def _offer_json(row):
    d = dict(row)
    d["id"] = str(d["id"])
    d["created_by"] = str(d["created_by"])
    d["on_behalf_of_grower_account_id"] = (
        str(d["on_behalf_of_grower_account_id"]) if d.get("on_behalf_of_grower_account_id") else None
    )
    for f in ("expected_volume", "acres_offered", "desired_price", "protein_pct", "moisture_pct_max", "min_order", "yield_rate",
              "test_weight", "bcfm_pct", "tannin_level_max", "bnfm_pct"):
        d[f] = _num(d.get(f))
    # Merges this offer's override_* fields with the per-commodity production_data default —
    # the GROWER's, not the creator's, when an operator listed this on a grower's behalf (an
    # operator's own production_data has nothing to do with that grower's practices).
    production_account_id = d["on_behalf_of_grower_account_id"] or d["created_by"]
    d["production"] = resolve_production(production_account_id, d["commodity"], row, marketing_year=d.get("marketing_year"))
    d["has_active_negotiation"] = has_active_negotiation("offer", d["id"])
    # How much of this offer hasn't already gone into an accepted response's contract — lets
    # several buyers each take part of one offer over time (see responses_routes.py's
    # committed_amount_for_listing) instead of the first accepted response claiming it all.
    d["remaining_volume"] = remaining_amount_for_listing("offer", d["id"], d["expected_volume"])
    d["aggregate_growers"] = _aggregate_growers_by_offer([d["id"]]).get(d["id"], [])
    return d


def _aggregate_growers_by_offer(offer_ids):
    """offer id -> [{grower_account_id, grower_name, contributed_volume}] for aggregated
    operator listings (offer_aggregate_growers). Two queries regardless of how many offers."""
    if not offer_ids:
        return {}
    rows = sb.select("offer_aggregate_growers", {
        "offer_id": f"in.({','.join(offer_ids)})", "select": "offer_id,grower_account_id,contributed_volume",
    })
    if not rows:
        return {}
    grower_ids = {str(r["grower_account_id"]) for r in rows}
    names = {
        str(a["id"]): a.get("name")
        for a in sb.select("accounts", {"id": f"in.({','.join(grower_ids)})", "select": "id,name"})
    }
    out = {}
    for r in rows:
        out.setdefault(str(r["offer_id"]), []).append({
            "grower_account_id": str(r["grower_account_id"]),
            "grower_name": names.get(str(r["grower_account_id"])),
            "contributed_volume": _num(r.get("contributed_volume")),
        })
    return out


def _offer_json_batch(rows):
    """Same shape as _offer_json for a whole page of rows at once, but batches the three lookups
    _offer_json otherwise runs per-row (production_data default, active-negotiation status,
    accepted-response amounts) into one query each — browse_offers can return many listings, and
    those three sequential per-row queries were adding real, measured latency (e.g. ~1.3s for just
    4 offers) that only gets worse as more listings are published."""
    if not rows:
        return []
    ids = [str(r["id"]) for r in rows]
    account_ids = {str(r.get("on_behalf_of_grower_account_id") or r["created_by"]) for r in rows}

    production_rows = sb.select("production_data", {"account_id": f"in.({','.join(account_ids)})", "select": "*"})
    production_by_key = {(str(p["account_id"]), p["commodity"], p["marketing_year"]): p for p in production_rows}

    negotiating_ids = active_negotiation_listing_ids("offer", ids)
    accepted_by_listing = accepted_proposed_volumes_by_listing("offer", ids)
    aggregates = _aggregate_growers_by_offer(ids)

    out = []
    for row in rows:
        d = dict(row)
        d["id"] = str(d["id"])
        d["created_by"] = str(d["created_by"])
        d["on_behalf_of_grower_account_id"] = (
            str(d["on_behalf_of_grower_account_id"]) if d.get("on_behalf_of_grower_account_id") else None
        )
        for f in ("expected_volume", "acres_offered", "desired_price", "protein_pct", "moisture_pct_max", "min_order", "yield_rate",
                  "test_weight", "bcfm_pct", "tannin_level_max", "bnfm_pct"):
            d[f] = _num(d.get(f))
        production_account_id = d["on_behalf_of_grower_account_id"] or d["created_by"]
        offer_year = d.get("marketing_year") or "any"
        default = production_by_key.get((production_account_id, d["commodity"], offer_year))
        if default is None and offer_year != "any":
            default = production_by_key.get((production_account_id, d["commodity"], "any"))
        d["production"] = resolve_production(production_account_id, d["commodity"], row, prefetched_default=default)
        d["has_active_negotiation"] = d["id"] in negotiating_ids
        total = d["expected_volume"]
        if total is None:
            d["remaining_volume"] = None
        else:
            committed = sum((v if v is not None else total) for v in accepted_by_listing.get(d["id"], []))
            d["remaining_volume"] = total - committed
        d["aggregate_growers"] = aggregates.get(d["id"], [])
        out.append(d)
    return out


@offers_bp.route("/api/offers", methods=["POST"])
@requires_auth
def create_offer():
    acct, err = _require_account()
    if err:
        return err
    if session.get("role") not in ("grower", "program_operator"):
        return jsonify({"error": "only growers and program operators can create offers"}), 403

    data = request.get_json() or {}
    if not data.get("commodity"):
        return jsonify({"error": "Missing required field: commodity"}), 400
    if data["commodity"] not in VISIBLE_COMMODITIES:
        return jsonify({"error": f"commodity must be one of {VISIBLE_COMMODITIES}"}), 400
    if data.get("price_type") and data["price_type"] not in VALID_PRICE_TYPE:
        return jsonify({"error": f"price_type must be one of {VALID_PRICE_TYPE}"}), 400
    if data.get("override_irrigation_type") and data["override_irrigation_type"] not in VALID_IRRIGATION:
        return jsonify({"error": f"override_irrigation_type must be one of {VALID_IRRIGATION}"}), 400
    if data.get("override_yield_unit") and data["override_yield_unit"] not in VALID_YIELD_UNIT:
        return jsonify({"error": f"override_yield_unit must be one of {VALID_YIELD_UNIT}"}), 400
    if data.get("seed_variety") and data["seed_variety"] not in VALID_SEED_VARIETY:
        return jsonify({"error": f"seed_variety must be one of {VALID_SEED_VARIETY}"}), 400
    status = data.get("status", "published")
    if status not in VALID_STATUS:
        return jsonify({"error": f"status must be one of {VALID_STATUS}"}), 400
    # Saving a draft is always allowed — only going live needs business verification.
    if status != "draft":
        unverified = require_verified(acct, session.get("role"), "publish a listing")
        if unverified:
            return unverified

    quantity_basis = data.get("quantity_basis", "grain")
    if quantity_basis not in VALID_QUANTITY_BASIS:
        return jsonify({"error": f"quantity_basis must be one of {VALID_QUANTITY_BASIS}"}), 400
    listing_timing = data.get("listing_timing", "available")
    if listing_timing not in VALID_LISTING_TIMING:
        return jsonify({"error": f"listing_timing must be one of {VALID_LISTING_TIMING}"}), 400
    if listing_timing == "future" and not (data.get("delivery_window_start") and data.get("delivery_window_end")):
        return jsonify({"error": "delivery_window_start and delivery_window_end are required for a Future listing"}), 400
    range_err = (date_range_error(data.get("delivery_window_start"), data.get("delivery_window_end"), "Delivery Window")
                 or date_range_error(data.get("harvest_start"), data.get("harvest_end"), "Harvest Window"))
    if range_err:
        return jsonify({"error": range_err}), 400

    uom = data.get("uom") or "bushels"
    if uom not in VALID_UOM:
        return jsonify({"error": f"uom must be one of {VALID_UOM}"}), 400

    yield_rate = None
    yield_unit = None
    acres_offered_input = _num(data.get("acres_offered"))
    if quantity_basis == "acres":
        # Acres segment doesn't take a Total Volume input at all — it's always computed from
        # acres x yield rate, server-side, so every downstream reader (browse filters, matching,
        # contracts) still just sees a plain expected_volume/uom like every other offer.
        yield_rate = _num(data.get("yield_rate"))
        yield_unit = data.get("yield_unit")
        area_unit = data.get("area_unit") or "acres"
        if area_unit not in VALID_AREA_UNIT:
            return jsonify({"error": f"area_unit must be one of {VALID_AREA_UNIT}"}), 400
        if yield_unit not in VALID_QUANTITY_YIELD_UNIT:
            return jsonify({"error": f"yield_unit must be one of {VALID_QUANTITY_YIELD_UNIT}"}), 400
        if acres_offered_input is None or acres_offered_input <= 0 or yield_rate is None or yield_rate <= 0:
            return jsonify({"error": "acres_offered and yield_rate are required for an Acres listing"}), 400
        try:
            expected_volume = units.yield_to_volume(acres_offered_input, yield_rate, yield_unit, data["commodity"], uom)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
    else:
        expected_volume = _num(data.get("expected_volume"))
        if expected_volume is None or expected_volume <= 0:
            return jsonify({"error": "Missing required field: expected_volume"}), 400

    # An operator can create this offer attributed to one of their actively-enrolled growers
    # instead of their own grain — but it can't go live until that grower approves it (see
    # approve_offer/decline_offer below), and the acres offered this way are capped by that
    # grower's own acres_enrolled.
    on_behalf_of = data.get("on_behalf_of_grower_account_id") or None
    if on_behalf_of:
        if session.get("role") != "program_operator":
            return jsonify({"error": "only program operators can create an offer on behalf of a grower"}), 403
        if acres_offered_input is None:
            return jsonify({"error": "acres_offered is required when creating an offer on behalf of an enrolled grower"}), 400
        enrollment, remaining = remaining_enrolled_acres(acct, on_behalf_of)
        if not enrollment:
            return jsonify({"error": "this grower is not actively enrolled in your program"}), 400
        if remaining is not None and acres_offered_input > remaining:
            return jsonify({
                "error": f"This exceeds the grower's remaining enrolled acres ({remaining:g} available) "
                         f"— ask them to increase their enrolled acres first.",
            }), 400

    # Aggregated listing: the operator lists under their own name, pooling volume from several
    # actively-enrolled growers (plus, optionally, some of their own). Enrollment itself is the
    # growers' consent to being aggregated (see ProgramAffiliation's copy), so unlike a
    # single-grower on-behalf listing there's no per-grower approval step — each contributor is
    # notified instead. Grain-basis only: contributions are volumes in this offer's uom.
    aggregate = data.get("aggregate_growers") if isinstance(data.get("aggregate_growers"), list) else []
    aggregate_rows = []
    if aggregate:
        if session.get("role") != "program_operator":
            return jsonify({"error": "only program operators can create an aggregated listing"}), 403
        if on_behalf_of:
            return jsonify({"error": "a listing is either on behalf of one grower or aggregated, not both"}), 400
        if quantity_basis != "grain":
            return jsonify({"error": "aggregated listings are grain-basis only"}), 400
        seen = set()
        for item in aggregate:
            gid = str((item or {}).get("grower_account_id") or "")
            vol = _num((item or {}).get("contributed_volume"))
            if not gid or gid in seen:
                return jsonify({"error": "each aggregated grower must appear once"}), 400
            if vol is None or vol <= 0:
                return jsonify({"error": "each aggregated grower needs a contributed volume"}), 400
            if not active_enrollment_for(acct, gid):
                return jsonify({"error": "every aggregated grower must be actively enrolled in your program"}), 400
            seen.add(gid)
            aggregate_rows.append({"grower_account_id": gid, "contributed_volume": vol})
        if sum(r["contributed_volume"] for r in aggregate_rows) > expected_volume + 1e-9:
            return jsonify({"error": "growers' contributions add up to more than the listing's total volume"}), 400
    own_volume = expected_volume - sum(r["contributed_volume"] for r in aggregate_rows)

    marketing_year = data.get("marketing_year") or None
    locations = data.get("locations") if isinstance(data.get("locations"), list) else []

    # A grower's (or operator's) own (non-on-behalf) listing draws down their Grower Inventory
    # balance for this commodity/marketing_year, shared with their bid-responses (see
    # inventory_routes.py) — nothing to cap against if they haven't set up inventory for it yet.
    # Grain-basis draws the volume pool; acres-basis draws the separate acres pool.
    if session.get("role") in ("grower", "program_operator") and not on_behalf_of and marketing_year:
        if quantity_basis == "grain":
            inventory, remaining_inv = inventory_routes.remaining_volume(acct, data["commodity"], marketing_year)
            if remaining_inv is not None:
                # Only the operator's own share counts against their own inventory — the rest
                # of an aggregated listing is the enrolled growers' grain.
                converted = units.convert_volume(own_volume, uom, inventory["uom"], data["commodity"])
                if converted > remaining_inv:
                    return jsonify({
                        "error": f"This exceeds your remaining {data['commodity']} inventory for {marketing_year} "
                                 f"({remaining_inv:g} {inventory['uom']} available) — update your inventory or reduce the amount.",
                    }), 400
        else:
            _inventory, remaining_ac = inventory_routes.remaining_acres(acct, data["commodity"], marketing_year)
            if remaining_ac is not None and acres_offered_input > remaining_ac:
                return jsonify({
                    "error": f"This exceeds your remaining {data['commodity']} acres inventory for {marketing_year} "
                             f"({remaining_ac:g} acres available) — update your inventory or reduce the amount.",
                }), 400

    row = {
        "created_by": acct,
        "commodity": data["commodity"],
        "variety": data.get("variety") or None,
        "marketing_year": marketing_year,
        "expected_volume": expected_volume,
        "uom": uom,
        "quantity_basis": quantity_basis,
        "listing_timing": listing_timing,
        "delivery_window_start": data.get("delivery_window_start") or None,
        "delivery_window_end": data.get("delivery_window_end") or None,
        "acres_offered": acres_offered_input,
        "area_unit": data.get("area_unit") or None,
        "yield_rate": yield_rate,
        "yield_unit": yield_unit,
        "price_type": data.get("price_type") or None,
        "desired_price": _num(data.get("desired_price")),
        "protein_pct": _num(data.get("protein_pct")),
        "moisture_pct_max": _num(data.get("moisture_pct_max")),
        "min_order": _num(data.get("min_order")),
        "test_weight": _num(data.get("test_weight")),
        # Defaults to 3% (matches the DB column default) when omitted/cleared, not null.
        "bcfm_pct": _num(data.get("bcfm_pct")) if _num(data.get("bcfm_pct")) is not None else 3,
        "seed_variety": data.get("seed_variety") or None,
        "tannin_level_max": _num(data.get("tannin_level_max")),
        "non_tannin_sorghum": bool(data.get("non_tannin_sorghum")),
        "bnfm_pct": _num(data.get("bnfm_pct")),
        "harvest_start": data.get("harvest_start") or None,
        "harvest_end": data.get("harvest_end") or None,
        # NONE_OPTION can ride along from Production Data's prefill — it means "none", so drop it.
        "sustainability_attributes": [a for a in _as_list(data.get("sustainability_attributes")) if a != NONE_OPTION],
        "specialty_attributes": [a for a in _as_list(data.get("specialty_attributes")) if a != NONE_OPTION],
        "locations": locations,
        "certifications": _as_list(data.get("certifications")),
        # Forced to draft/pending regardless of the requested status until the grower approves —
        # see the on_behalf_of validation above.
        "status": "draft" if on_behalf_of else status,
        "on_behalf_of_grower_account_id": on_behalf_of,
        "grower_approval_status": "pending" if on_behalf_of else "not_required",
        # Per-listing overrides of the grower's per-commodity production_data default (null =
        # inherit that default). Booleans are tri-state: only an actual true/false counts as an
        # override, so an omitted/null field doesn't get coerced into "override to false".
        "override_actual_yield_per_acre": _num(data.get("override_actual_yield_per_acre")),
        "override_irrigation_type": data.get("override_irrigation_type") or None,
        "override_crop_rotation_years": _num(data.get("override_crop_rotation_years")),
        "override_crop_rotation_crops": _num(data.get("override_crop_rotation_crops")),
        "override_soil_test_on_file": data.get("override_soil_test_on_file") if isinstance(data.get("override_soil_test_on_file"), bool) else None,
        "override_third_party_verified": data.get("override_third_party_verified") if isinstance(data.get("override_third_party_verified"), bool) else None,
        "override_input_usage_notes": (data.get("override_input_usage_notes") or "").strip() or None,
        "override_yield_unit": data.get("override_yield_unit") or None,
        # A list (even empty) is an explicit override; anything else (missing, null) means
        # "inherit the commodity default" — same tri-state convention as the scalars above.
        "override_conservation_practices": data.get("override_conservation_practices") if isinstance(data.get("override_conservation_practices"), list) else None,
    }
    created = sb.insert(TABLE, row)
    if aggregate_rows:
        sb.insert("offer_aggregate_growers", [
            {"offer_id": str(created["id"]), **r} for r in aggregate_rows
        ], return_representation=False)
        operator_name = (sb.select("accounts", {"id": f"eq.{acct}", "select": "name", "limit": 1}) or [{}])[0].get("name")
        label = f"{row['commodity']} — {row['variety']}" if row.get("variety") else row["commodity"]
        for r in aggregate_rows:
            notify(
                r["grower_account_id"], "aggregate_listing_included",
                title=f"{operator_name or 'Your program operator'} included your grain in an aggregated {label} listing",
                body=f"{r['contributed_volume']:g} {uom} of your grain.",
                link_type="enrollment", link_id=created["id"],
            )
    if on_behalf_of:
        label = f"{row['commodity']} — {row['variety']}" if row.get("variety") else row["commodity"]
        notify(
            on_behalf_of, "offer_approval_requested",
            title=f"A program operator wants to list {label} on your behalf",
            body=f"{acres_offered_input:g} acres — review and approve or decline.",
            link_type="offer", link_id=created["id"],
        )
    return jsonify({"success": True, "offer": _offer_json(created)})


@offers_bp.route("/api/offers/mine", methods=["GET"])
@requires_auth
def my_offers():
    acct, err = _require_account()
    if err:
        return err
    rows = sb.select(TABLE, {"created_by": f"eq.{acct}", "order": "created_at.desc", "select": "*"})

    grower_ids = {str(r["on_behalf_of_grower_account_id"]) for r in rows if r.get("on_behalf_of_grower_account_id")}
    names = {}
    if grower_ids:
        for a in sb.select("accounts", {"id": f"in.({','.join(grower_ids)})", "select": "id,name"}):
            names[str(a["id"])] = a.get("name")

    out = []
    for r in rows:
        d = _offer_json(r)
        gid = d.get("on_behalf_of_grower_account_id")
        d["on_behalf_of_grower_name"] = names.get(str(gid)) if gid else None
        out.append(d)
    return jsonify({"success": True, "offers": out})


@offers_bp.route("/api/offers/pending-approval", methods=["GET"])
@requires_auth
def offers_pending_approval():
    """Offers a program operator wants to list on this grower's behalf, awaiting their
    approval — see create_offer's on_behalf_of_grower_account_id handling."""
    acct, err = _require_account()
    if err:
        return err
    if session.get("role") != "grower":
        return jsonify({"error": "only growers have offers awaiting approval"}), 403
    rows = sb.select(TABLE, {
        "on_behalf_of_grower_account_id": f"eq.{acct}", "grower_approval_status": "eq.pending",
        "order": "created_at.desc", "select": "*",
    })
    operator_ids = {str(r["created_by"]) for r in rows}
    names = {}
    if operator_ids:
        for a in sb.select("accounts", {"id": f"in.({','.join(operator_ids)})", "select": "id,name"}):
            names[str(a["id"])] = a.get("name")

    out = []
    for r in rows:
        d = _offer_json(r)
        d["operator_name"] = names.get(d["created_by"])
        out.append(d)
    return jsonify({"success": True, "offers": out})


def _owned_pending_approval(offer_id, acct):
    rows = sb.select(TABLE, {
        "id": f"eq.{offer_id}",
        "select": "on_behalf_of_grower_account_id,grower_approval_status,created_by,commodity,variety", "limit": 1,
    })
    if not rows:
        return None, (jsonify({"error": "offer not found"}), 404)
    row = rows[0]
    if str(row.get("on_behalf_of_grower_account_id") or "") != acct:
        return None, (jsonify({"error": "only the grower this offer is on behalf of can act on it"}), 403)
    if row["grower_approval_status"] != "pending":
        return None, (jsonify({"error": "this offer is not awaiting your approval"}), 400)
    return row, None


@offers_bp.route("/api/offers/<offer_id>/approve", methods=["POST"])
@requires_auth
def approve_offer(offer_id):
    acct, err = _require_account()
    if err:
        return err
    row, owned_err = _owned_pending_approval(offer_id, acct)
    if owned_err:
        return owned_err
    updated = sb.update(TABLE, {"id": f"eq.{offer_id}"}, {
        "grower_approval_status": "approved", "status": "published", "updated_at": _now(),
    }, return_representation=True)
    label = f"{row['commodity']} — {row['variety']}" if row.get("variety") else row["commodity"]
    notify(
        row["created_by"], "offer_approved",
        title=f"Your on-behalf-of listing for {label} was approved",
        link_type="offer", link_id=offer_id,
    )
    return jsonify({"success": True, "offer": _offer_json(updated[0])})


@offers_bp.route("/api/offers/<offer_id>/decline", methods=["POST"])
@requires_auth
def decline_offer(offer_id):
    acct, err = _require_account()
    if err:
        return err
    row, owned_err = _owned_pending_approval(offer_id, acct)
    if owned_err:
        return owned_err
    sb.update(TABLE, {"id": f"eq.{offer_id}"}, {
        "grower_approval_status": "declined", "status": "withdrawn", "updated_at": _now(),
    })
    label = f"{row['commodity']} — {row['variety']}" if row.get("variety") else row["commodity"]
    notify(
        row["created_by"], "offer_declined",
        title=f"Your on-behalf-of listing for {label} was declined",
        link_type="offer", link_id=offer_id,
    )
    return jsonify({"success": True})


@offers_bp.route("/api/offers", methods=["GET"])
@requires_auth
def browse_offers():
    _acct, err = _require_account()
    if err:
        return err
    commodities = [c.strip() for c in request.args.get("commodities", "").split(",") if c.strip()]
    states = [s.strip().upper() for s in request.args.get("states", "").split(",") if s.strip()]
    certifications = [c.strip() for c in request.args.get("certifications", "").split(",") if c.strip()]
    attributes = [a.strip() for a in request.args.get("attributes", "").split(",") if a.strip()]
    practices = [p.strip() for p in request.args.get("practices", "").split(",") if p.strip()]
    qty_min = _num(request.args.get("quantity_min"))
    qty_max = _num(request.args.get("quantity_max"))
    quantity_basis = request.args.get("quantity_basis")
    organizations = [o.strip() for o in request.args.get("organizations", "").split(",") if o.strip()]

    rows = sb.select(TABLE, {
        "status": "eq.published", "commodity": VISIBLE_COMMODITY_FILTER, "order": "created_at.desc", "select": "*",
    })
    matched_rows = []
    for r in rows:
        if quantity_basis and r.get("quantity_basis") != quantity_basis:
            continue
        # Matches the GROWER on an operator's on-behalf-of listing, not the operator — the same
        # "economically relevant account" the production-data resolution already uses above.
        if organizations and str(r.get("on_behalf_of_grower_account_id") or r.get("created_by") or "") not in organizations:
            continue
        if commodities and r.get("commodity") not in commodities:
            continue
        if states and not ({(loc.get("state") or "").upper() for loc in (r.get("locations") or [])} & set(states)):
            continue
        if certifications and not (set(r.get("certifications") or []) & set(certifications)):
            continue
        if attributes and not ((set(r.get("sustainability_attributes") or []) | set(r.get("specialty_attributes") or [])) & set(attributes)):
            continue
        vol = _num(r.get("expected_volume"))
        if qty_min is not None and (vol is None or vol < qty_min):
            continue
        if qty_max is not None and (vol is None or vol > qty_max):
            continue
        matched_rows.append(r)

    # Batched, not one-query-per-row — see _offer_json_batch.
    built = _offer_json_batch(matched_rows)
    out = []
    for d in built:
        # Conservation practices only exist resolved (commodity default merged with any
        # per-listing override — see resolve_production), so this filter has to run after
        # building the offer's JSON rather than against the raw row like the others above.
        if practices and not (set(d["production"]["conservation_practices"]) & set(practices)):
            continue
        out.append(d)

    # The creator's own display name — for ProfileLink on the browse card ("View Profile" should
    # show whose profile it is, not just a generic label). Batch-fetched, not per-row, same
    # convention as contracts_routes.py's seller_name/buyer_name.
    creator_ids = {d["created_by"] for d in out}
    if creator_ids:
        names = {str(a["id"]): a.get("name") for a in sb.select("accounts", {"id": f"in.({','.join(creator_ids)})", "select": "id,name"})}
        for d in out:
            d["created_by_name"] = names.get(d["created_by"])

    return jsonify({"success": True, "offers": out})


# Fields safe to edit in place — none of these interact with the inventory-cap or partial-
# fulfillment math (quantity_basis, expected_volume, acres_offered, yield_rate/unit, area_unit,
# uom, marketing_year, listing_timing, commodity are never editable here at all, not just once a
# response is accepted — withdraw and create a new listing for those). A tri-state field
# (override_conservation_practices) is only touched if the key is present in the request body at
# all, same convention as create_offer.
EDITABLE_OFFER_FIELDS = (
    "variety", "price_type", "desired_price", "protein_pct", "moisture_pct_max", "min_order",
    "harvest_start", "harvest_end", "delivery_window_start", "delivery_window_end", "sustainability_attributes",
    "specialty_attributes", "certifications", "locations", "override_conservation_practices",
    "test_weight", "bcfm_pct", "seed_variety", "tannin_level_max", "non_tannin_sorghum", "bnfm_pct",
)
IMMUTABLE_OFFER_FIELDS = (
    "commodity", "quantity_basis", "listing_timing", "expected_volume", "uom", "acres_offered",
    "area_unit", "yield_rate", "yield_unit", "marketing_year",
)


@offers_bp.route("/api/offers/<offer_id>", methods=["PATCH"])
@requires_auth
def update_offer(offer_id):
    acct, err = _require_account()
    if err:
        return err
    rows = sb.select(TABLE, {
        "id": f"eq.{offer_id}", "limit": 1,
        "select": "created_by,delivery_window_start,delivery_window_end,harvest_start,harvest_end",
    })
    if not rows:
        return jsonify({"error": "offer not found"}), 404
    if str(rows[0]["created_by"]) != acct:
        return jsonify({"error": "only the creator can edit this listing"}), 403

    data = request.get_json() or {}
    range_err = (merged_date_range_error(rows[0], data, "delivery_window_start", "delivery_window_end", "Delivery Window")
                 or merged_date_range_error(rows[0], data, "harvest_start", "harvest_end", "Harvest Window"))
    if range_err:
        return jsonify({"error": range_err}), 400
    attempted_immutable = [f for f in IMMUTABLE_OFFER_FIELDS if f in data]
    if attempted_immutable:
        return jsonify({
            "error": f"{', '.join(attempted_immutable)} can't be edited after a listing is created "
                     f"— withdraw it and create a new one instead.",
        }), 400
    if data.get("seed_variety") and data["seed_variety"] not in VALID_SEED_VARIETY:
        return jsonify({"error": f"seed_variety must be one of {VALID_SEED_VARIETY}"}), 400

    patch = {}
    for f in EDITABLE_OFFER_FIELDS:
        if f not in data:
            continue
        if f in ("desired_price", "protein_pct", "moisture_pct_max", "min_order",
                  "test_weight", "bcfm_pct", "tannin_level_max", "bnfm_pct"):
            patch[f] = _num(data[f])
        elif f in ("sustainability_attributes", "specialty_attributes", "certifications"):
            patch[f] = _as_list(data[f])
        elif f == "locations":
            patch[f] = data[f] if isinstance(data[f], list) else []
        elif f == "override_conservation_practices":
            patch[f] = data[f] if isinstance(data[f], list) else None
        elif f == "non_tannin_sorghum":
            patch[f] = bool(data[f])
        else:
            patch[f] = data[f] or None
    if not patch:
        return jsonify({"error": "nothing to update"}), 400
    patch["updated_at"] = _now()
    updated = sb.update(TABLE, {"id": f"eq.{offer_id}"}, patch, return_representation=True)
    return jsonify({"success": True, "offer": _offer_json(updated[0])})


@offers_bp.route("/api/offers/<offer_id>/publish", methods=["POST"])
@requires_auth
def publish_offer(offer_id):
    """Take one of the creator's own drafts live. A draft can be saved without business
    verification; publishing it is where verification is enforced (business_verification.py).
    An operator's on-behalf draft is excluded — that one goes live through the grower's approval."""
    acct, err = _require_account()
    if err:
        return err
    rows = sb.select(TABLE, {
        "id": f"eq.{offer_id}", "select": "created_by,status,on_behalf_of_grower_account_id", "limit": 1,
    })
    if not rows:
        return jsonify({"error": "offer not found"}), 404
    row = rows[0]
    if str(row["created_by"]) != acct:
        return jsonify({"error": "only the creator can publish this listing"}), 403
    if row["status"] != "draft" or row.get("on_behalf_of_grower_account_id"):
        return jsonify({"error": "only your own draft listings can be published"}), 400
    unverified = require_verified(acct, session.get("role"), "publish a listing")
    if unverified:
        return unverified
    updated = sb.update(TABLE, {"id": f"eq.{offer_id}"}, {"status": "published", "updated_at": _now()}, return_representation=True)
    return jsonify({"success": True, "offer": _offer_json(updated[0])})


@offers_bp.route("/api/offers/<offer_id>/withdraw", methods=["POST"])
@requires_auth
def withdraw_offer(offer_id):
    acct, err = _require_account()
    if err:
        return err
    rows = sb.select(TABLE, {"id": f"eq.{offer_id}", "select": "created_by", "limit": 1})
    if not rows:
        return jsonify({"error": "offer not found"}), 404
    if str(rows[0]["created_by"]) != acct:
        return jsonify({"error": "only the creator can withdraw this offer"}), 403
    sb.update(TABLE, {"id": f"eq.{offer_id}"}, {"status": "withdrawn", "updated_at": _now()})
    return jsonify({"success": True})


@offers_bp.route("/api/offers/<offer_id>/touch", methods=["POST"])
@requires_auth
def touch_offer(offer_id):
    """Bumps updated_at to confirm a listing is still valid — the action behind the "still
    interested?" nudge for offers that haven't been touched in a while (see MyOffersTable)."""
    acct, err = _require_account()
    if err:
        return err
    rows = sb.select(TABLE, {"id": f"eq.{offer_id}", "select": "created_by", "limit": 1})
    if not rows:
        return jsonify({"error": "offer not found"}), 404
    if str(rows[0]["created_by"]) != acct:
        return jsonify({"error": "only the creator can refresh this offer"}), 403
    sb.update(TABLE, {"id": f"eq.{offer_id}"}, {"updated_at": _now()})
    return jsonify({"success": True})


def _upload_offer_document(offer_id, acct, column, slug):
    rows = sb.select(TABLE, {"id": f"eq.{offer_id}", "select": "created_by,commodity", "limit": 1})
    if not rows:
        return jsonify({"error": "offer not found"}), 404
    if str(rows[0]["created_by"]) != acct:
        return jsonify({"error": "only the creator can attach documents to this listing"}), 403
    file = request.files.get("file")
    if not file or not file.filename:
        return jsonify({"error": "file is required"}), 400
    data = file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        return jsonify({"error": "file too large (10MB max)"}), 400

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    path = f"{acct}/offers/{offer_id}/{slug}.{ext}"
    try:
        storage.upload(path, data, file.mimetype or "application/octet-stream")
    except storage.StorageError as e:
        logger.error("offer %s upload failed: %s", slug, e)
        return jsonify({"error": "upload failed"}), 502

    updated = sb.update(TABLE, {"id": f"eq.{offer_id}"}, {column: path, "updated_at": _now()}, return_representation=True)
    return jsonify({"success": True, "offer": _offer_json(updated[0])})


def _delete_offer_document(offer_id, acct, column):
    rows = sb.select(TABLE, {"id": f"eq.{offer_id}", "select": f"created_by,{column}", "limit": 1})
    if not rows:
        return jsonify({"error": "offer not found"}), 404
    if str(rows[0]["created_by"]) != acct:
        return jsonify({"error": "only the creator can remove documents from this listing"}), 403
    path = rows[0].get(column)
    if path:
        try:
            storage.delete(path)
        except storage.StorageError as e:
            logger.warning("offer %s delete failed (continuing): %s", column, e)
    updated = sb.update(TABLE, {"id": f"eq.{offer_id}"}, {column: None, "updated_at": _now()}, return_representation=True)
    return jsonify({"success": True, "offer": _offer_json(updated[0])})


@offers_bp.route("/api/offers/<offer_id>/verification-document", methods=["POST"])
@requires_auth
def upload_offer_verification_document(offer_id):
    acct, err = _require_account()
    if err:
        return err
    return _upload_offer_document(offer_id, acct, "override_verification_document_path", "verification")


@offers_bp.route("/api/offers/<offer_id>/verification-document", methods=["DELETE"])
@requires_auth
def delete_offer_verification_document(offer_id):
    acct, err = _require_account()
    if err:
        return err
    return _delete_offer_document(offer_id, acct, "override_verification_document_path")


@offers_bp.route("/api/offers/<offer_id>/soil-test-document", methods=["POST"])
@requires_auth
def upload_offer_soil_test_document(offer_id):
    acct, err = _require_account()
    if err:
        return err
    return _upload_offer_document(offer_id, acct, "override_soil_test_document_path", "soil-test")


@offers_bp.route("/api/offers/<offer_id>/soil-test-document", methods=["DELETE"])
@requires_auth
def delete_offer_soil_test_document(offer_id):
    acct, err = _require_account()
    if err:
        return err
    return _delete_offer_document(offer_id, acct, "override_soil_test_document_path")
