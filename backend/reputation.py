"""Real counterparty reputation, replacing matching_routes.py's flat placeholder score (item 71
— no reputation concept existed anywhere before this). Computed live from `contracts`, same
"live-summed, never stored" philosophy as every other running total in this app — no new table.

Pass 2's profile cards are the intended display surface for this; this batch only builds the
real number so that later work has something honest to show, per plans/meti-match's
Phase 9 write-up.
"""
import sb

# Reliability caps out at the same 20 points matching_routes.py's placeholder used to award
# flat to everyone — swapping the number in for real data, not changing the rubric's weighting.
RELIABILITY_MAX_PTS = 20


def score_for_account(account_id):
    """{completed_contracts, on_time_rate} for one account, counting a contract on either side
    (seller or buyer) — reputation reflects this account's own reliability regardless of which
    side of the trade it was on. on_time_rate is None when none of the account's completed
    contracts have a delivery_window_end on file (nothing to judge timing against) — the caller
    falls back to completed_contracts alone in that case.

    "On time" compares a completed contract's delivery_window_end against updated_at's date —
    contracts.status is terminal once 'completed' (see contracts_routes.update_contract_status,
    which bumps updated_at on every transition and blocks moving status backward), so updated_at
    on a completed row is effectively its completion date; there's no separate completed_at
    column, so this is the best signal actually on file."""
    rows = sb.select("contracts", {
        "or": f"(seller_account_id.eq.{account_id},buyer_account_id.eq.{account_id})",
        "status": "eq.completed",
        "select": "delivery_window_end,updated_at",
    })
    completed = len(rows)
    timed = [r for r in rows if r.get("delivery_window_end")]
    on_time_rate = None
    if timed:
        on_time_count = sum(1 for r in timed if str(r["updated_at"])[:10] <= str(r["delivery_window_end"])[:10])
        on_time_rate = round(on_time_count / len(timed), 3)
    return {"completed_contracts": completed, "on_time_rate": on_time_rate}


def scores_for_accounts(account_ids):
    """score_for_account for many accounts in ONE query instead of one per account — the shape a
    directory listing needs (see directory_routes.py). Returns {account_id: {...}} with an entry
    for every id asked for, including accounts with no contracts at all.

    The per-row loop this replaces is the same measured N+1 trap offers_routes.py's
    _offer_json_batch calls out; a directory page lists every account in the marketplace, so it
    would be the worst place in the app to pay it."""
    ids = [str(a) for a in account_ids]
    out = {aid: {"completed_contracts": 0, "on_time_rate": None} for aid in ids}
    if not ids:
        return out
    joined = ",".join(ids)
    rows = sb.select("contracts", {
        "or": f"(seller_account_id.in.({joined}),buyer_account_id.in.({joined}))",
        "status": "eq.completed",
        "select": "seller_account_id,buyer_account_id,delivery_window_end,updated_at",
    })
    # A contract counts for BOTH of its parties (same as score_for_account counting either side).
    per_account = {aid: [] for aid in ids}
    for r in rows:
        for side in ("seller_account_id", "buyer_account_id"):
            aid = str(r.get(side) or "")
            if aid in per_account:
                per_account[aid].append(r)
    for aid, account_rows in per_account.items():
        timed = [r for r in account_rows if r.get("delivery_window_end")]
        on_time_rate = None
        if timed:
            on_time_count = sum(1 for r in timed if str(r["updated_at"])[:10] <= str(r["delivery_window_end"])[:10])
            on_time_rate = round(on_time_count / len(timed), 3)
        out[aid] = {"completed_contracts": len(account_rows), "on_time_rate": on_time_rate}
    return out


def reliability_points(account_id):
    """Maps score_for_account onto matching_routes.py's 0-20 reliability dimension. A brand new
    account (no completed contracts yet) gets the midpoint, same neutral treatment the old flat
    placeholder gave everyone — untested is not the same as unreliable. Once there's a real
    on_time_rate, it drives the score directly; with completed contracts but no timing data on
    file, a flat higher-than-neutral score rewards the completions themselves without pretending
    to know punctuality."""
    data = score_for_account(account_id)
    if data["on_time_rate"] is not None:
        return round(data["on_time_rate"] * RELIABILITY_MAX_PTS), data
    if data["completed_contracts"] > 0:
        return round(RELIABILITY_MAX_PTS * 0.75), data
    return round(RELIABILITY_MAX_PTS * 0.5), data
