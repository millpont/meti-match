"""Signal Match Results — scored counterparty ranking for one of the caller's own listings. See
plans/meti-match/03-api-plan.md (Phase 5).

Scoring rubric (0-100), computed from fields both offers and bids actually have:
  - Commodity/variety match (25 pts) — commodity match is a hard filter (candidates are
    pre-filtered to the same commodity); variety match on top of that is the scored part.
  - Delivery window overlap (25 pts) — offer.harvest_start/end vs bid.delivery_window_start/end,
    as a fraction of the requested window covered.
  - Quality/attribute match (30 pts) — how much of the bid's required_attributes the offer's
    sustainability/specialty attributes + certifications cover.
  - Counterparty reliability (20 pts) — the offer/bid candidate's own on-time completed-contract
    rate (see reputation.py). A brand new counterparty with no completed contracts yet gets a
    neutral midpoint score rather than being penalized for having no history.

Carbon / environmental-data listings (see environmental.py) are pre-filtered to the same outcome
(their commodity is the outcome label), and the 25-point commodity/variety component becomes
vintage-year overlap (15) + source-state overlap (10) — the same overlap dimensions meti-v2's
Match page matched on. Their implied value is quantity x price directly (same unit both sides).

Note: unlike the old open_match engine, there's no meaningful "location match" between a US
state (offers) and a destination country (bids), so that dimension from the original plan doc is
replaced with the variety-match component above, which both listing types actually carry.
"""
import logging
from datetime import date

from flask import Blueprint, request, jsonify, session

import sb
import units
import reputation
from auth import requires_auth
from production_data_routes import resolve_production
from environmental import MARKET_COMMODITIES, is_environmental

logger = logging.getLogger(__name__)
matching_bp = Blueprint("matching", __name__)

LISTING_TABLES = {"offer": "offers", "bid": "bids"}
OPEN_STATUS = {"offer": "published", "bid": "open"}


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


def _parse_date(v):
    if not v:
        return None
    try:
        return date.fromisoformat(str(v)[:10])
    except (TypeError, ValueError):
        return None


def _window_overlap_pct(a_start, a_end, b_start, b_end):
    """Fraction (0..1) of window B covered by window A. None if either window is incomplete."""
    a_start, a_end, b_start, b_end = (_parse_date(x) for x in (a_start, a_end, b_start, b_end))
    if not (a_start and a_end and b_start and b_end):
        return None
    latest_start = max(a_start, b_start)
    earliest_end = min(a_end, b_end)
    overlap_days = (earliest_end - latest_start).days + 1
    requested_days = (b_end - b_start).days + 1
    if requested_days <= 0:
        return None
    return max(0.0, min(1.0, overlap_days / requested_days))


def _offer_attributes(offer):
    return (
        set(offer.get("sustainability_attributes") or [])
        | set(offer.get("specialty_attributes") or [])
        | set(offer.get("certifications") or [])
    )


def _offer_practices(offer):
    """Conservation practices effective for this offer — resolved against the grower's
    production_data defaults (see production_data_routes.resolve_production), the same way
    browse_offers' own practices filter already does, but _score never did until now. Resolved
    against the GROWER's account when on-behalf-of, never the operator's, matching
    offers_routes.py's _offer_json."""
    production_account_id = offer.get("on_behalf_of_grower_account_id") or offer.get("created_by")
    resolved = resolve_production(production_account_id, offer.get("commodity"), offer, marketing_year=offer.get("marketing_year"))
    return set(resolved.get("conservation_practices") or [])


def _score(offer, bid, counterparty_account_id):
    reasons = {}
    points = 0.0

    if is_environmental(bid):
        overlap_pts, overlap_reason = _environmental_overlap(offer, bid)
        reasons["vintage_location_match"] = overlap_reason
        points += overlap_pts
        return _score_rest(offer, bid, counterparty_account_id, reasons, points)

    variety_matched = bool(bid.get("variety")) and bid.get("variety") == offer.get("variety")
    cv_pts = 25 if variety_matched else 18
    reasons["commodity_variety_match"] = {"variety_matched": variety_matched, "points": cv_pts}
    points += cv_pts
    return _score_rest(offer, bid, counterparty_account_id, reasons, points)


def _overlap_fraction(have, want):
    """Share of `want` covered by `have`; None when either side didn't specify anything."""
    have, want = set(have or []), set(want or [])
    if not have or not want:
        return None
    return len(have & want) / len(want)


def _environmental_overlap(offer, bid):
    vintage = _overlap_fraction(offer.get("vintage_years"), bid.get("vintage_years"))
    states = _overlap_fraction(offer.get("source_states"), bid.get("source_states"))
    vintage_pts = round((vintage if vintage is not None else 0.5) * 15)
    state_pts = round((states if states is not None else 0.5) * 10)
    return vintage_pts + state_pts, {
        "vintage_overlap_pct": None if vintage is None else round(vintage * 100),
        "state_overlap_pct": None if states is None else round(states * 100),
        "points": vintage_pts + state_pts,
    }


def _score_rest(offer, bid, counterparty_account_id, reasons, points):
    # Prefer the offer's own delivery window (comparing delivery-to-delivery is more correct) —
    # fall back to its harvest window when no delivery window is on file (e.g. an "available now"
    # listing was never required to set one), so the match signal doesn't go dark for those.
    offer_window_start = offer.get("delivery_window_start") or offer.get("harvest_start")
    offer_window_end = offer.get("delivery_window_end") or offer.get("harvest_end")
    overlap = _window_overlap_pct(
        offer_window_start, offer_window_end,
        bid.get("delivery_window_start"), bid.get("delivery_window_end"),
    )
    overlap_pts = round((overlap if overlap is not None else 0.5) * 25)
    reasons["delivery_window_overlap"] = {
        "overlap_pct": round((overlap if overlap is not None else 0.5) * 100),
        "known": overlap is not None,
        "points": overlap_pts,
    }
    points += overlap_pts

    # required_data_requirements is deliberately excluded here — per the client's own "future
    # vision" framing (see taxonomy_routes.py), it's negotiated over chat today, not matched on.
    required = (
        set(bid.get("required_attributes") or [])
        | set(bid.get("required_practices") or [])
        | set(bid.get("required_certifications") or [])
    )
    have = _offer_attributes(offer) | _offer_practices(offer)
    covered = (len(required & have) / len(required)) if required else 1.0
    quality_pts = round(covered * 30)
    reasons["quality_attribute_match"] = {"covered_pct": round(covered * 100), "points": quality_pts}
    points += quality_pts

    reliability_pts, reliability_data = reputation.reliability_points(counterparty_account_id)
    reasons["counterparty_reliability"] = {"points": reliability_pts, **reliability_data}
    points += reliability_pts

    return round(points), reasons


@matching_bp.route("/api/matching/preview", methods=["GET"])
@requires_auth
def preview_matches():
    acct, err = _require_account()
    if err:
        return err
    listing_type = request.args.get("listing_type")
    listing_id = request.args.get("listing_id")
    if listing_type not in LISTING_TABLES or not listing_id:
        return jsonify({"error": "listing_type (offer|bid) and listing_id are required"}), 400

    rows = sb.select(LISTING_TABLES[listing_type], {"id": f"eq.{listing_id}", "select": "*", "limit": 1})
    if not rows:
        return jsonify({"error": "listing not found"}), 404
    mine = rows[0]
    if str(mine["created_by"]) != acct:
        return jsonify({"error": "only the listing's creator can preview matches"}), 403

    counterpart_type = "bid" if listing_type == "offer" else "offer"
    candidates = sb.select(LISTING_TABLES[counterpart_type], {
        "status": f"eq.{OPEN_STATUS[counterpart_type]}",
        "commodity": f"eq.{mine['commodity']}",
        "select": "*",
    })
    # Same hidden-crop rule as the Marketplace browse (an old Wheat listing's owner shouldn't be
    # matched against other hidden Wheat listings either).
    if mine["commodity"] not in MARKET_COMMODITIES:
        candidates = []

    # My own offer's MT-equivalent volume, computed once — used to show an implied total $
    # value against every bid candidate's $/MT price, so bushels/MT/acres-basis offers are all
    # comparable to a buyer's price regardless of which unit the offer itself was posted in.
    my_mt_equivalent = None
    environmental = is_environmental(mine)
    if listing_type == "offer" and environmental:
        # Outcome listings price per their own unit on both sides — no MT conversion.
        my_mt_equivalent = _num(mine.get("expected_volume"))
    elif listing_type == "offer":
        try:
            my_mt_equivalent = units.volume_to_mt(_num(mine.get("expected_volume")), mine.get("uom"), mine.get("commodity"))
        except ValueError:
            my_mt_equivalent = None

    scored = []
    for c in candidates:
        offer_row, bid_row = (mine, c) if listing_type == "offer" else (c, mine)
        score, reasons = _score(offer_row, bid_row, str(c["created_by"]))
        entry = {
            "candidate_id": str(c["id"]),
            "candidate_type": counterpart_type,
            "created_by": str(c["created_by"]),
            "commodity": c["commodity"],
            "variety": c.get("variety"),
            "match_score": score,
            "rationale": reasons,
        }
        if counterpart_type == "bid":
            entry["quantity"] = _num(c.get("quantity"))
            entry["bid_price_usd_per_mt"] = _num(c.get("bid_price_usd_per_mt"))
            if my_mt_equivalent is not None and entry["bid_price_usd_per_mt"] is not None:
                entry["implied_total_value_usd"] = round(my_mt_equivalent * entry["bid_price_usd_per_mt"], 2)
        else:
            entry["expected_volume"] = _num(c.get("expected_volume"))
            entry["uom"] = c.get("uom")
            entry["desired_price"] = _num(c.get("desired_price"))
            try:
                entry["mt_equivalent"] = (
                    None if environmental
                    else units.volume_to_mt(entry["expected_volume"], c.get("uom"), c.get("commodity"))
                )
            except ValueError:
                entry["mt_equivalent"] = None
        scored.append(entry)

    scored.sort(key=lambda x: x["match_score"], reverse=True)
    return jsonify({
        "success": True,
        "listing": {"id": str(mine["id"]), "commodity": mine["commodity"]},
        "matches": scored,
    })
