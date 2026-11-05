"""Marketplace Directory — every account on the platform, browsable by role, with the profile
information a counterparty would actually want before reaching out (photo, org description,
reputation, how many live listings they have). A top-level navigation surface next to the
Marketplace, not a dashboard tab.

Generalizes service_requests_routes.py's `GET /api/service-providers` (which is hardcoded to
service providers and gated to requester roles only) in three ways:

  1. Any authenticated account can browse — including superadmins and service providers, who are
     locked out of the provider directory by its _require_requester gate.
  2. Roles are a parameter, not hardcoded.
  3. Reputation and listing counts are BATCHED (one contracts query, one offers query, one bids
     query for the whole page) rather than per-account. The provider directory pays an N+1 for
     both; a directory listing the whole marketplace is the worst place in the app to do that —
     see reputation.scores_for_accounts and offers_routes.py's _offer_json_batch docstring.

**No contact fields are returned at all** (no email, phone or contact name), so there is nothing
here for `contact_visible` to gate — the Directory is deliberately a "who exists and what are
they offering" view, and reaching someone goes through the existing profile/messaging surfaces.

Accounts are listed by `accounts.role`, the account's primary role — the same resolution the
provider directory and the representation/enrollment pickers already use.
"""
import logging

from flask import Blueprint, request, jsonify, session

import sb
import reputation
from auth import requires_auth
from profile_routes import photo_url
from environmental import MARKET_COMMODITY_FILTER

logger = logging.getLogger(__name__)
directory_bp = Blueprint("directory", __name__)

DIRECTORY_ROLES = ("grower", "international_buyer", "program_operator", "service_provider")


def _require_account():
    acct = session.get("account_id")
    if not acct:
        return None, (jsonify({"error": "no account access"}), 403)
    return str(acct), None


def _active_listing_counts(account_ids):
    """{account_id: {"offers": n, "bids": n}} for live listings, in two queries total.

    Counts against the *economically relevant* account — an operator's on-behalf-of offer counts
    for the GROWER, not the operator, matching how offers_routes.py attributes production data
    and how the Marketplace's organization filter matches (see offers_routes.py's browse)."""
    out = {aid: {"offers": 0, "bids": 0} for aid in account_ids}
    if not account_ids:
        return out
    for offer in sb.select("offers", {
        "status": "eq.published", "commodity": MARKET_COMMODITY_FILTER, "select": "created_by,on_behalf_of_grower_account_id",
    }):
        aid = str(offer.get("on_behalf_of_grower_account_id") or offer.get("created_by") or "")
        if aid in out:
            out[aid]["offers"] += 1
    for bid in sb.select("bids", {
        "status": "eq.open", "buyer_approval_status": "neq.pending", "commodity": MARKET_COMMODITY_FILTER,
        "select": "created_by,on_behalf_of_buyer_account_id",
    }):
        aid = str(bid.get("on_behalf_of_buyer_account_id") or bid.get("created_by") or "")
        if aid in out:
            out[aid]["bids"] += 1
    return out


def _listing_summary(counts):
    """Short human line for the card — "3 supply offers · 1 buyer listing"."""
    parts = []
    if counts["offers"]:
        parts.append(f"{counts['offers']} supply {'offer' if counts['offers'] == 1 else 'offers'}")
    if counts["bids"]:
        parts.append(f"{counts['bids']} buyer {'listing' if counts['bids'] == 1 else 'listings'}")
    return " · ".join(parts) or "No active listings"


@directory_bp.route("/api/directory", methods=["GET"])
@requires_auth
def browse_directory():
    _acct, err = _require_account()
    if err:
        return err
    roles = [r.strip() for r in request.args.get("roles", "").split(",") if r.strip()]
    invalid = [r for r in roles if r not in DIRECTORY_ROLES]
    if invalid:
        return jsonify({"error": f"roles must be among {DIRECTORY_ROLES}"}), 400
    has_listings_only = request.args.get("has_listings") in ("1", "true", "yes")

    params = {
        "select": "id,role,name,display_name,bio,photo_path",
        "order": "name.asc",
        # 'admin' accounts are internal, not marketplace participants — never list them.
        "role": f"in.({','.join(roles)})" if roles else f"in.({','.join(DIRECTORY_ROLES)})",
    }
    accounts = sb.select("accounts", params)
    if not accounts:
        return jsonify({"success": True, "entries": []})

    ids = [str(a["id"]) for a in accounts]
    reputations = reputation.scores_for_accounts(ids)
    counts = _active_listing_counts(ids)

    entries = []
    for a in accounts:
        aid = str(a["id"])
        c = counts[aid]
        total = c["offers"] + c["bids"]
        if has_listings_only and total == 0:
            continue
        entries.append({
            "account_id": aid,
            "role": a.get("role"),
            "name": a.get("name"),
            "display_name": a.get("display_name"),
            "photo_url": photo_url(a.get("photo_path")),
            "bio": a.get("bio"),
            "reputation": reputations[aid],
            "active_listing_count": total,
            "active_offer_count": c["offers"],
            "active_bid_count": c["bids"],
            "listing_summary": _listing_summary(c),
        })
    return jsonify({"success": True, "entries": entries})


@directory_bp.route("/api/organizations", methods=["GET"])
@requires_auth
def list_organizations():
    """id + name + role for every marketplace account — the option list behind the Marketplace's
    Organization filter. Names aren't unique (accounts.name has no unique constraint), so the
    filter's wire value has to be the account id with the name shown as its label."""
    _acct, err = _require_account()
    if err:
        return err
    accounts = sb.select("accounts", {
        "select": "id,name,role",
        "role": f"in.({','.join(DIRECTORY_ROLES)})",
        "order": "name.asc",
    })
    return jsonify({"success": True, "organizations": [
        {"account_id": str(a["id"]), "name": a.get("name"), "role": a.get("role")} for a in accounts
    ]})
