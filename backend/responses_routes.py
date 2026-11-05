"""Responses to a listing — "Contact Supplier" / "Respond to Bid" / "Place a Bid". Generalizes
the old open_match jsonb matches/match_statuses approach into its own table, shared by both
offers and bids as the listing side. See plans/meti-match/02-data-model.md.

Phase 3 adds the full status lifecycle and per-response chat (mirrors match_routes.py's
update_status/_negotiation_thread, generalized to work over either listing type)."""
import logging
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify, session

import sb
import inventory_routes
from auth import requires_auth
from notifications_routes import notify
from business_verification import require_verified

logger = logging.getLogger(__name__)
responses_bp = Blueprint("responses", __name__)

TABLE = "listing_responses"
MESSAGES_TABLE = "listing_response_messages"
LISTING_TABLES = {"offer": "offers", "bid": "bids"}
# The status a listing has while it's live on the Marketplace — only then can anyone respond.
LIVE_STATUS = {"offer": "published", "bid": "open"}
VALID_STATUSES = ("in-communication", "in-negotiation", "accepted", "declined")
# Chat opens once the listing's creator clicks "Start Communication" (pending -> in-communication)
# and stays open through negotiation/acceptance; a still-pending or declined response can't chat.
CHATTABLE_STATUSES = ("in-communication", "in-negotiation", "accepted")


def _now():
    return datetime.now(timezone.utc).isoformat()


def has_active_negotiation(listing_type, listing_id):
    """Whether any response on this listing has reached 'in-negotiation' — surfaced as an
    urgency badge on the board (offers_routes.py/bids_routes.py) so other browsers can see a
    listing is actively being contested, not just sitting open."""
    rows = sb.select(TABLE, {
        "listing_type": f"eq.{listing_type}", "listing_id": f"eq.{listing_id}",
        "status": "eq.in-negotiation", "select": "id", "limit": 1,
    })
    return bool(rows)


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


def _listing_label(listing):
    """"Corn — Hard Red Winter" style label for a notification title."""
    return f"{listing['commodity']} — {listing['variety']}" if listing.get("variety") else listing["commodity"]


def _response_json(row):
    d = dict(row)
    d["id"] = str(d["id"])
    d["listing_id"] = str(d["listing_id"])
    d["responder_account_id"] = str(d["responder_account_id"])
    d["proposed_price"] = _num(d.get("proposed_price"))
    d["proposed_volume"] = _num(d.get("proposed_volume"))
    d["match_score"] = _num(d.get("match_score"))
    return d


def _listing_total(listing_type, listing):
    return _num(listing.get("expected_volume")) if listing_type == "offer" else _num(listing.get("quantity"))


def committed_amount_for_listing(listing_type, listing_id, listing_total):
    """Sum of proposed_volume across this listing's ACCEPTED responses — a legacy accepted
    response with no proposed_volume on file (from before amount-picking existed) counts as the
    full listing_total, matching how an accept with no stated amount always meant "the whole
    thing." Live-computed, not stored, same self-healing philosophy as every other cap in this
    app: a response that's never accepted (or later un-accepted) never counted against this."""
    rows = sb.select(TABLE, {
        "listing_type": f"eq.{listing_type}", "listing_id": f"eq.{listing_id}", "status": "eq.accepted",
        "select": "proposed_volume",
    })
    total = 0.0
    for r in rows:
        v = _num(r.get("proposed_volume"))
        total += v if v is not None else (listing_total or 0)
    return total


def remaining_amount_for_listing(listing_type, listing_id, listing_total):
    """None if the listing has no total on file to cap against (shouldn't happen in practice —
    both offers.expected_volume and bids.quantity are required at creation)."""
    if listing_total is None:
        return None
    return listing_total - committed_amount_for_listing(listing_type, listing_id, listing_total)


def active_negotiation_listing_ids(listing_type, listing_ids):
    """Batched has_active_negotiation — one query for a whole page of listings instead of one
    query per listing (see offers_routes.py's _offer_json_batch / bids_routes.py's
    _bid_json_batch, used by the browse endpoints where this per-row query pattern was showing
    up as real, user-visible latency)."""
    if not listing_ids:
        return set()
    rows = sb.select(TABLE, {
        "listing_type": f"eq.{listing_type}", "listing_id": f"in.({','.join(listing_ids)})",
        "status": "eq.in-negotiation", "select": "listing_id",
    })
    return {str(r["listing_id"]) for r in rows}


def accepted_proposed_volumes_by_listing(listing_type, listing_ids):
    """Batched committed_amount_for_listing — listing_id -> list of proposed_volume across that
    listing's ACCEPTED responses (None meaning "counts as the full listing," same legacy
    convention committed_amount_for_listing already uses). The caller combines this with each
    listing's own total, same math committed_amount_for_listing does, just batched."""
    if not listing_ids:
        return {}
    rows = sb.select(TABLE, {
        "listing_type": f"eq.{listing_type}", "listing_id": f"in.({','.join(listing_ids)})",
        "status": "eq.accepted", "select": "listing_id,proposed_volume",
    })
    out = {}
    for r in rows:
        out.setdefault(str(r["listing_id"]), []).append(_num(r.get("proposed_volume")))
    return out


def _grower_inventory_check(acct, listing_type, listing, marketing_year, proposed_volume):
    """A grower/operator responding to a buyer's bid with an amount + marketing year draws on
    the same Grower Inventory pool as their own Offers (see inventory_routes.committed_volume/
    committed_acres) — checked here too, not just client-side, so the cap is real. Branches on
    the bid's bid_type: an acres_for_contracting response draws the separate acres pool, not the
    grain pool. None (no error) if the response isn't this specific case, or if there's no
    inventory row on file yet for this commodity/marketing_year (nothing to cap against)."""
    if listing_type != "bid" or not marketing_year or proposed_volume is None:
        return None
    if session.get("role") not in ("grower", "program_operator"):
        return None
    if listing.get("bid_type") == "acres_for_contracting":
        _, remaining = inventory_routes.remaining_acres(acct, listing["commodity"], marketing_year)
        if remaining is not None and proposed_volume > remaining:
            return f"That exceeds your remaining {listing['commodity']} acres inventory for {marketing_year} ({remaining:g} acres left)."
        return None
    _, remaining = inventory_routes.remaining_volume(acct, listing["commodity"], marketing_year)
    if remaining is not None and proposed_volume > remaining:
        return f"That exceeds your remaining {listing['commodity']} inventory for {marketing_year} ({remaining:g} left)."
    return None


def _create_response(listing_type, listing_id):
    acct, err = _require_account()
    if err:
        return err
    table = LISTING_TABLES[listing_type]
    rows = sb.select(table, {"id": f"eq.{listing_id}", "select": "*", "limit": 1})
    if not rows:
        return jsonify({"error": f"{listing_type} not found"}), 404
    listing = rows[0]
    if str(listing["created_by"]) == acct:
        return jsonify({"error": f"cannot respond to your own {listing_type}"}), 400
    # A draft, closed/withdrawn, or still-awaiting-approval listing isn't on the Marketplace, so
    # it can't be responded to even by someone who has its id.
    if listing.get("status") != LIVE_STATUS[listing_type] or listing.get("buyer_approval_status") == "pending":
        return jsonify({"error": f"this {listing_type} isn't open for responses"}), 400
    unverified = require_verified(acct, session.get("role"), "contact a lister or respond to a listing")
    if unverified:
        return unverified

    data = request.get_json() or {}
    proposed_volume = _num(data.get("proposed_volume"))
    marketing_year = (data.get("marketing_year") or "").strip() or None
    inventory_error = _grower_inventory_check(acct, listing_type, listing, marketing_year, proposed_volume)
    if inventory_error:
        return jsonify({"error": inventory_error}), 400

    # Partial fulfillment: several responses can each be accepted into their own contract, as
    # long as their amounts never together exceed the listing's own original total — see
    # committed_amount_for_listing/remaining_amount_for_listing above. This is the client's own
    # scenario: an RFQ for 1,000 MT can be met by several separate accepted responses, each
    # shrinking what's left for the next one.
    listing_total = _listing_total(listing_type, listing)
    remaining = remaining_amount_for_listing(listing_type, listing_id, listing_total)
    if proposed_volume is not None and remaining is not None and proposed_volume > remaining + 1e-9:
        return jsonify({"error": f"Only {remaining:g} remaining on this listing."}), 400
    if listing_type == "bid" and not listing.get("allow_partial", True):
        if proposed_volume is not None and remaining is not None and abs(proposed_volume - remaining) > 1e-9:
            return jsonify({"error": "This buyer requires a response for the full remaining amount."}), 400

    row = {
        "listing_type": listing_type,
        "listing_id": listing_id,
        "responder_account_id": acct,
        "proposed_price": _num(data.get("proposed_price")),
        "proposed_volume": proposed_volume,
        "marketing_year": marketing_year,
        # Set when the response was initiated from the Signal Match Results screen
        # (matching_routes.py) rather than a plain browse-and-contact.
        "match_score": _num(data.get("match_score")),
        "status": "pending",
    }
    created = sb.insert(TABLE, row)
    notify(
        listing["created_by"], "response_received",
        title=f"New response to your {_listing_label(listing)}",
        link_type="response", link_id=created["id"],
    )
    return jsonify({"success": True, "response": _response_json(created)})


@responses_bp.route("/api/offers/<listing_id>/respond", methods=["POST"])
@requires_auth
def respond_to_offer(listing_id):
    return _create_response("offer", listing_id)


@responses_bp.route("/api/bids/<listing_id>/respond", methods=["POST"])
@requires_auth
def respond_to_bid(listing_id):
    return _create_response("bid", listing_id)


def _person_name(account_row):
    """The individual behind an account, as far as it's public: their self-chosen display name,
    else the contact name only if they've made contact details visible (profile_routes.py's
    public-profile rule)."""
    if account_row.get("display_name"):
        return str(account_row["display_name"]).strip()
    if account_row.get("contact_visible") and account_row.get("contact_name"):
        return str(account_row["contact_name"]).strip()
    return None


def _enrich_with_listing_summary(rows, viewer_account_id, viewer_is_creator, include_responder_name=False):
    """Adds what the Responses tab needs to show at a glance, before anyone opens a thread: the
    listing, WHO the other side is (organization + person), and the latest message with whether
    it's waiting on the viewer. Batched — 3-4 queries for the whole list, not per row."""
    offer_ids = {str(r["listing_id"]) for r in rows if r["listing_type"] == "offer"}
    bid_ids = {str(r["listing_id"]) for r in rows if r["listing_type"] == "bid"}
    summaries = {}
    creators = {}
    if offer_ids:
        for o in sb.select("offers", {"id": f"in.({','.join(offer_ids)})", "select": "id,commodity,variety,expected_volume,uom,created_by"}):
            summaries[("offer", str(o["id"]))] = {
                "commodity": o["commodity"], "variety": o.get("variety"),
                "quantity": o.get("expected_volume"), "uom": o.get("uom"),
            }
            creators[("offer", str(o["id"]))] = str(o["created_by"])
    if bid_ids:
        for b in sb.select("bids", {"id": f"in.({','.join(bid_ids)})", "select": "id,commodity,variety,quantity,bid_type,created_by"}):
            summaries[("bid", str(b["id"]))] = {
                "commodity": b["commodity"], "variety": b.get("variety"),
                "quantity": b.get("quantity"), "uom": "MT",
            }
            creators[("bid", str(b["id"]))] = str(b["created_by"])

    def counterparty_id(r):
        if viewer_is_creator:
            return str(r["responder_account_id"])
        return creators.get((r["listing_type"], str(r["listing_id"])))

    party_ids = {cid for cid in (counterparty_id(r) for r in rows) if cid}
    accounts = {}
    if party_ids:
        accounts = {
            str(a["id"]): a
            for a in sb.select("accounts", {
                "id": f"in.({','.join(party_ids)})",
                "select": "id,name,role,display_name,contact_name,contact_visible",
            })
        }

    latest = {}
    counts = {}
    response_ids = [str(r["id"]) for r in rows]
    if response_ids:
        for m in sb.select(MESSAGES_TABLE, {
            "response_id": f"in.({','.join(response_ids)})", "order": "created_at.desc",
            "select": "response_id,sender_account_id,body,created_at",
        }):
            rid = str(m["response_id"])
            counts[rid] = counts.get(rid, 0) + 1
            latest.setdefault(rid, m)  # first seen is newest (ordered desc)

    out = []
    for r in rows:
        d = _response_json(r)
        d["listing_summary"] = summaries.get((r["listing_type"], str(r["listing_id"])))
        cid = counterparty_id(r)
        acct_row = accounts.get(cid) if cid else None
        d["counterparty"] = {
            "account_id": cid,
            "organization_name": acct_row.get("name") if acct_row else None,
            "person_name": _person_name(acct_row) if acct_row else None,
            "role": acct_row.get("role") if acct_row else None,
        } if cid else None
        if include_responder_name:
            d["responder_name"] = acct_row.get("name") if acct_row else None
        last = latest.get(str(r["id"]))
        d["message_count"] = counts.get(str(r["id"]), 0)
        d["last_message"] = {
            "body": last["body"][:280],
            "created_at": last["created_at"],
            "is_mine": str(last["sender_account_id"]) == viewer_account_id,
        } if last else None
        # "Needs your reply": a brand-new request on my listing nobody has acted on yet, or a
        # live thread whose latest message is from the other side.
        open_thread = r["status"] in ("in-communication", "in-negotiation")
        d["awaiting_my_reply"] = bool(
            (viewer_is_creator and r["status"] == "pending")
            or (open_thread and last and str(last["sender_account_id"]) != viewer_account_id)
        )
        out.append(d)
    return out


@responses_bp.route("/api/responses", methods=["GET"])
@requires_auth
def my_responses():
    """Dual perspective, like today's user_matches: responses I made, and responses made
    against listings I created."""
    acct, err = _require_account()
    if err:
        return err
    mine = sb.select(TABLE, {"responder_account_id": f"eq.{acct}", "order": "created_at.desc", "select": "*"})

    my_offer_ids = [str(r["id"]) for r in sb.select("offers", {"created_by": f"eq.{acct}", "select": "id"})]
    my_bid_ids = [str(r["id"]) for r in sb.select("bids", {"created_by": f"eq.{acct}", "select": "id"})]

    to_mine = []
    if my_offer_ids:
        to_mine += sb.select(TABLE, {
            "listing_type": "eq.offer", "listing_id": f"in.({','.join(my_offer_ids)})",
            "order": "created_at.desc", "select": "*",
        })
    if my_bid_ids:
        to_mine += sb.select(TABLE, {
            "listing_type": "eq.bid", "listing_id": f"in.({','.join(my_bid_ids)})",
            "order": "created_at.desc", "select": "*",
        })

    return jsonify({
        "success": True,
        "made_by_me": _enrich_with_listing_summary(mine, acct, viewer_is_creator=False),
        "to_my_listings": _enrich_with_listing_summary(to_mine, acct, viewer_is_creator=True, include_responder_name=True),
    })


def _one(table, row_id, select="*"):
    rows = sb.select(table, {"id": f"eq.{row_id}", "select": select, "limit": 1})
    return rows[0] if rows else None


def _listing_creator(listing_type, listing_id):
    row = _one(LISTING_TABLES[listing_type], listing_id, "created_by")
    return str(row["created_by"]) if row else None


def _authorize_response(response_id, acct):
    """Returns (response_row, listing_creator_id, error). The two participants on a response are
    the listing's creator and the responder — either may act on it, but only the creator may
    change its status (mirrors match_routes.py's update_status authorization)."""
    row = _one(TABLE, response_id)
    if not row:
        return None, None, (jsonify({"error": "response not found"}), 404)
    creator = _listing_creator(row["listing_type"], str(row["listing_id"]))
    responder = str(row["responder_account_id"])
    if acct not in (creator, responder):
        return None, None, (jsonify({"error": "not a participant on this response"}), 403)
    return row, creator, None


def _create_contract_if_needed(response_row, creator_account_id):
    """Create the contract for a newly-accepted response, if one doesn't already exist —
    idempotent, since contracts.response_id is unique. See contracts_routes.py."""
    response_id = str(response_row["id"])
    if sb.select("contracts", {"response_id": f"eq.{response_id}", "select": "id", "limit": 1}):
        return

    listing_type = response_row["listing_type"]
    listing = _one(LISTING_TABLES[listing_type], str(response_row["listing_id"]))
    if not listing:
        return

    responder = str(response_row["responder_account_id"])
    offer, bid = (listing, None) if listing_type == "offer" else (None, listing)
    seller_id, buyer_id = (creator_account_id, responder) if listing_type == "offer" else (responder, creator_account_id)

    final_volume = _num(response_row.get("proposed_volume"))
    if final_volume is None:
        final_volume = _num(offer.get("expected_volume")) if offer else _num(bid.get("quantity"))

    final_price = _num(response_row.get("proposed_price"))
    if final_price is None:
        final_price = _num(offer.get("desired_price")) if offer else _num(bid.get("bid_price_usd_per_mt"))

    delivery_start, delivery_end = (
        (bid.get("delivery_window_start"), bid.get("delivery_window_end")) if bid
        else (
            offer.get("delivery_window_start") or offer.get("harvest_start"),
            offer.get("delivery_window_end") or offer.get("harvest_end"),
        )
    )

    sb.insert("contracts", {
        "response_id": response_id,
        "seller_account_id": seller_id,
        "buyer_account_id": buyer_id,
        "commodity": listing["commodity"],
        "variety": listing.get("variety"),
        "final_volume": final_volume,
        "final_price_usd_per_mt": final_price,
        "delivery_window_start": delivery_start,
        "delivery_window_end": delivery_end,
        "status": "pending",
    }, return_representation=False)


@responses_bp.route("/api/responses/<response_id>/status", methods=["POST"])
@requires_auth
def update_status(response_id):
    acct, err = _require_account()
    if err:
        return err
    new_status = (request.get_json() or {}).get("status")
    if new_status not in VALID_STATUSES:
        return jsonify({"error": f"status must be one of {VALID_STATUSES}"}), 400

    row, creator, err = _authorize_response(response_id, acct)
    if err:
        return err
    if acct != creator:
        return jsonify({"error": "only the listing's creator can update status"}), 403

    listing_type = row["listing_type"]
    listing_id = str(row["listing_id"])

    if new_status == "accepted":
        # Re-checked here, not just at response-creation time — several responses can sit
        # pending at once (e.g. three separate offers to cover one RFQ), and accepting them
        # doesn't have to happen in the order they were proposed, so a response that fit when
        # it was created might not fit anymore by the time someone gets around to accepting it.
        full_listing = _one(LISTING_TABLES[listing_type], listing_id, "*")
        listing_total = _listing_total(listing_type, full_listing) if full_listing else None
        remaining = remaining_amount_for_listing(listing_type, listing_id, listing_total)
        this_amount = _num(row.get("proposed_volume"))
        if this_amount is None:
            this_amount = listing_total or 0
        if remaining is not None and this_amount > remaining + 1e-9:
            return jsonify({
                "error": f"Accepting this would exceed what's left on this listing ({remaining:g} left) "
                         f"— decline it or ask them to lower the amount.",
            }), 400

    sb.update(TABLE, {"id": f"eq.{response_id}"}, {"status": new_status, "updated_at": _now()})
    if new_status == "accepted":
        _create_contract_if_needed(row, creator)
        # Fully committed now? Close the listing so no further responses can come in — it stays
        # open (published/open) while there's still something left, so multiple partial
        # responses can each be accepted over time.
        new_remaining = remaining_amount_for_listing(listing_type, listing_id, listing_total)
        if new_remaining is not None and new_remaining <= 1e-9:
            closed_status = "accepted" if listing_type == "offer" else "closed"
            sb.update(LISTING_TABLES[listing_type], {"id": f"eq.{listing_id}"}, {"status": closed_status, "updated_at": _now()})

    listing = _one(LISTING_TABLES[row["listing_type"]], str(row["listing_id"]), "commodity,variety")
    if new_status == "accepted":
        # Linked as an "agreement" so the bell takes them straight to the Agreements tab, where
        # the contract this just created lives — not back to the now-finished negotiation.
        notify(
            row["responder_account_id"], "status_changed",
            title=f"Agreement reached: your response to {_listing_label(listing)} was accepted",
            body="View it in your Agreements tab.",
            link_type="agreement", link_id=response_id,
        )
    else:
        notify(
            row["responder_account_id"], "status_changed",
            title=f"Your response to {_listing_label(listing)} is now {new_status.replace('-', ' ')}",
            link_type="response", link_id=response_id,
        )
    return jsonify({"success": True, "status": new_status})


@responses_bp.route("/api/responses/<response_id>/messages", methods=["GET"])
@requires_auth
def list_messages(response_id):
    acct, err = _require_account()
    if err:
        return err
    _row, _creator, err = _authorize_response(response_id, acct)
    if err:
        return err
    msgs = sb.select(MESSAGES_TABLE, {
        "response_id": f"eq.{response_id}", "order": "created_at.asc",
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


@responses_bp.route("/api/responses/<response_id>/messages", methods=["POST"])
@requires_auth
def post_message(response_id):
    acct, err = _require_account()
    if err:
        return err
    body = ((request.get_json() or {}).get("body") or "").strip()
    if not body:
        return jsonify({"error": "message body is required"}), 400
    if len(body) > 4000:
        return jsonify({"error": "message is too long (4000 char max)"}), 400
    row, creator, err = _authorize_response(response_id, acct)
    if err:
        return err
    if row["status"] not in CHATTABLE_STATUSES:
        return jsonify({"error": "the listing's creator must start communication before messaging"}), 400
    sb.insert(MESSAGES_TABLE, {
        "response_id": response_id, "sender_account_id": acct, "body": body,
    }, return_representation=False)

    responder = str(row["responder_account_id"])
    recipient = creator if acct == responder else responder
    listing = _one(LISTING_TABLES[row["listing_type"]], str(row["listing_id"]), "commodity,variety")
    notify(
        recipient, "message_received",
        title=f"New message about {_listing_label(listing)}",
        body=body[:200], link_type="response", link_id=response_id,
    )
    return jsonify({"success": True})
