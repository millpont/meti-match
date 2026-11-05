"""Shared contract-aggregation helpers — used by admin_routes.py's marketplace-wide dashboard
and contracts_routes.py's per-account "my activity" stats. Both compute the same shape of
{value, pct_change} stat over a trailing 30-day window vs. the prior 30-day window; they differ
only in which contracts they aggregate (all of them, vs. just the caller's own)."""
from datetime import datetime, timedelta, timezone


def now():
    return datetime.now(timezone.utc)


def num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def pct_change(current, previous):
    if not previous:
        return None
    return round((current - previous) / previous * 100, 1)


def _created_at(c):
    try:
        return datetime.fromisoformat(str(c["created_at"]).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def windowed(contracts):
    """Split contracts into (current 30-day window, prior 30-day window)."""
    n = now()
    window_start = n - timedelta(days=30)
    prior_start = n - timedelta(days=60)
    current = [c for c in contracts if (ts := _created_at(c)) and ts >= window_start]
    prior = [c for c in contracts if (ts := _created_at(c)) and prior_start <= ts < window_start]
    return current, prior


def volume(contracts):
    return sum(num(c.get("final_volume")) or 0 for c in contracts)


def gmv(contracts):
    total = 0.0
    for c in contracts:
        v, p = num(c.get("final_volume")), num(c.get("final_price_usd_per_mt"))
        if v is not None and p is not None:
            total += v * p
    return total


def distinct(contracts, key):
    return len({str(c[key]) for c in contracts})


def stat(fn, current, prior):
    return {"value": round(fn(current)), "pct_change": pct_change(fn(current), fn(prior))}
