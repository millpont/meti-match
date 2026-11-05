"""Tiny Supabase PostgREST client (service key). Used instead of direct psycopg2 because the
host's IP is not on the DB allow-list, but the REST endpoint is reachable — the same bypass the
METI lab uses.

Uses a single persistent requests.Session so repeated calls within a process reuse the same
pooled HTTPS connection instead of paying a fresh TCP+TLS handshake per call — some endpoints
(e.g. responses_routes.py's my_responses(), which resolves a polymorphic offer/bid association)
make close to ten sequential calls for one page load, and each handshake is real, user-visible
latency. Connection reuse fixes that without changing any call site.

Filter/value syntax is PostgREST's: eq., in.(a,b), cs.{x} (array contains), or=(...).
Array/JSON mutations are done read-modify-write in Python (PostgREST has no array_append/jsonb_set),
which is fine at this app's scale.
"""
import json
import urllib.parse

import requests

from config import config

session = requests.Session()


class SupabaseError(RuntimeError):
    pass


def _base():
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_KEY:
        raise SupabaseError("SUPABASE_URL / SUPABASE_SERVICE_KEY not configured")
    return config.SUPABASE_URL.rstrip("/") + "/rest/v1"


def _headers(extra=None):
    h = {
        "apikey": config.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {config.SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def _query_string(params):
    # Keep PostgREST operator punctuation intact; encode only what must be encoded.
    return "&".join(f"{k}={urllib.parse.quote(str(v), safe='.,()*:{}-')}" for k, v in params.items())


def _request(method, table, params=None, body=None, prefer=None):
    url = f"{_base()}/{table}"
    if params:
        url += "?" + _query_string(params)
    data = json.dumps(body).encode() if body is not None else None
    headers = _headers({"Prefer": prefer} if prefer else None)
    try:
        resp = session.request(method, url, data=data, headers=headers, timeout=20)
    except requests.RequestException as e:
        raise SupabaseError(f"{method} {table} -> request failed: {e}")
    if resp.status_code >= 400:
        raise SupabaseError(f"{method} {table} -> {resp.status_code}: {resp.text[:300]}")
    return resp.json() if resp.content else None


def select(table, params=None):
    return _request("GET", table, params=params or {}) or []


def insert(table, row, return_representation=True):
    prefer = "return=representation" if return_representation else "return=minimal"
    out = _request("POST", table, body=row, prefer=prefer)
    return (out[0] if isinstance(out, list) and out else out) if return_representation else None


def upsert(table, row, on_conflict=None):
    """`on_conflict` names the columns PostgREST should merge against — required whenever the
    table's real uniqueness constraint isn't its primary key (e.g. grower_inventory's PK is a
    separate `id`, with the actual one-row-per-(account,commodity,year) constraint living on a
    different unique index). Without it, PostgREST merges against the primary key only, and a
    second write to an existing (account_id, commodity, marketing_year) just collides instead of
    updating — this bit us once already, so it's an explicit, named argument now rather than
    something every future upsert() call site has to remember on its own."""
    params = {"on_conflict": on_conflict} if on_conflict else None
    _request("POST", table, params=params, body=row, prefer="resolution=merge-duplicates,return=minimal")


def update(table, params, patch, return_representation=False):
    prefer = "return=representation" if return_representation else "return=minimal"
    return _request("PATCH", table, params=params, body=patch, prefer=prefer)


def delete(table, params, return_representation=True):
    prefer = "return=representation" if return_representation else "return=minimal"
    return _request("DELETE", table, params=params, prefer=prefer)
